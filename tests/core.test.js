import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  harness,
  ready,
  until,
  deferred,
  fixtureAgents,
} from "./support/fixtures.js";
import { Store } from "../packages/storage/src/store.js";
import { roleContext } from "../packages/core/src/agents.js";
import { inputText, validateResult } from "../packages/core/src/contracts.js";
import { scenarios } from "../packages/core/src/scenarios.js";

const resources = [];
const make = (...args) => {
  const h = harness(...args);
  resources.push(() => h.close());
  return h;
};
afterEach(() => {
  resources
    .splice(0)
    .reverse()
    .forEach((fn) => fn());
});
describe("session lifecycle and persistence", () => {
  it("plans outside calls, reuses identity/memory and creates a new persona before reporting", async () => {
    const h = make();
    const { id, callId } = await ready(h, "interview");
    h.engine.send(id, callId, "first", "我會先驗證資料再切換流量。");
    await until(() => !h.store.get(id).busy);
    expect(h.agents.calls.filter((c) => c.kind === "plan")).toHaveLength(1);
    h.engine.closeCall(id, callId);
    await until(() => h.store.get(id).state === "awaiting_call");
    const second = h.engine.accept(id, h.store.get(id).pendingAssignmentId);
    await until(() => !h.store.get(id).busy);
    let s = h.store.get(id);
    expect(s.calls[1].personaId).toBe(s.calls[0].personaId);
    expect(
      h.agents.calls
        .filter((c) => c.kind === "reply")
        .at(-1)
        .context.messages.some((m) => m.text.includes("驗證資料")),
    ).toBe(true);
    h.engine.closeCall(id, second);
    await until(() => h.store.get(id).state === "awaiting_call");
    const third = h.engine.accept(id, h.store.get(id).pendingAssignmentId);
    await until(() => !h.store.get(id).busy);
    s = h.store.get(id);
    expect(s.calls[2].personaId).not.toBe(s.calls[0].personaId);
    expect(
      h.agents.calls.filter((c) => c.kind === "reply").at(-1).context.messages,
    ).toEqual([]);
    h.engine.closeCall(id, third);
    await until(() => h.store.get(id).state === "completed");
    s = h.store.get(id);
    expect(s.recaps).toHaveLength(3);
    expect(s.report.insufficientEvidence).toBe(false);
    expect(s.report.dimensions[0].evidenceIds).toContain(
      s.messages.find((m) => m.speaker === "user").id,
    );
    const requests = h.agents.calls.length;
    h.engine.view(id);
    expect(h.agents.calls).toHaveLength(requests);
    const nextId = h.engine.start("interview");
    await until(() => h.store.get(nextId).state === "awaiting_call");
    expect(h.store.get(nextId).personas.map((p) => p.id)).toEqual([
      "persona-0",
    ]);
    expect(
      h.agents.calls.filter((c) => c.kind === "plan").at(-1).context.personas,
    ).toEqual([]);
    expect(h.store.get(id).personas).toHaveLength(2);
  });
  it("rejects second active session, duplicate conflicting content, and late messages", async () => {
    const h = make();
    const { id, callId } = await ready(h);
    expect(() => h.engine.start("interview")).toThrow();
    const messageId = h.engine.send(id, callId, "same", "好");
    expect(h.engine.send(id, callId, "same", "好")).toBe(messageId);
    expect(() => h.engine.send(id, callId, "same", "不好")).toThrow();
    expect(() => h.engine.send(id, callId, "second", "等等")).toThrow();
    await until(() => !h.store.get(id).busy);
    expect(
      h.store.get(id).messages.filter((m) => m.speaker === "user"),
    ).toHaveLength(1);
    h.engine.closeCall(id, callId);
    expect(() => h.engine.send(id, callId, "late", "新訊息")).toThrow();
    // Retries of an already accepted message remain idempotent even after close.
    expect(h.engine.send(id, callId, "same", "好")).toBe(messageId);
  });
  it("durably records accepted messages and marks unfinished sessions interrupted on restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "role-cast-"));
    resources.push(() => rmSync(dir, { recursive: true, force: true }));
    const wait = deferred();
    const h = harness({ watch: () => wait.promise }, join(dir, "test.sqlite"));
    const { id, callId } = await ready(h);
    h.engine.send(id, callId, "saved", "保留這則訊息");
    h.close();
    const store = new Store(join(dir, "test.sqlite"));
    resources.push(() => store.close());
    store.recover();
    expect(store.get(id).state).toBe("interrupted");
    expect(store.get(id).messages.at(-1).text).toBe("保留這則訊息");
    expect(store.get(id).calls[0].endReason).toBe("interrupted");
    expect(store.active()).toBeUndefined();
    store.recover();
    expect(store.get(id).state).toBe("interrupted");
  });
  it("database constraints reject broken references and duplicate recaps", async () => {
    const h = make();
    const { id, callId } = await ready(h);
    expect(() =>
      h.store.db
        .prepare("INSERT INTO personas VALUES(?,?,?)")
        .run("missing", "p", "{}"),
    ).toThrow();
    h.engine.closeCall(id, callId);
    await until(() => h.store.get(id).recaps.length === 1);
    const s = h.store.get(id);
    s.recaps.push({ ...s.recaps[0], id: "duplicate" });
    expect(() => h.store.save(s)).toThrow();
    expect(h.store.get(id).recaps).toHaveLength(1);
  });
  it("turn and call limits terminate with recap/report", async () => {
    const bounded = structuredClone(scenarios);
    bounded[0].maxCalls = 1;
    bounded[0].maxUserTurnsPerCall = 1;
    const h = make({}, ":memory:", bounded);
    const { id, callId } = await ready(h);
    h.engine.send(id, callId, "limit", "好");
    await until(() => h.store.get(id).state === "completed");
    expect(h.store.get(id).calls[0].endReason).toBe("turn_limit");
    expect(h.store.get(id).recaps).toHaveLength(1);
  });
});
describe("cancellation and concurrent work", () => {
  it.each(["persona-first", "judge-first"])(
    "StopCall suppresses reply (%s)",
    async (order) => {
      const reply = deferred(),
        watch = deferred();
      let replies = 0;
      const base = fixtureAgents();
      const h = make({
        reply: (ctx, signal) =>
          ++replies === 1 ? base.run("reply", ctx, signal) : reply.promise,
        watch: () => watch.promise,
      });
      const { id, callId } = await ready(h);
      h.engine.send(id, callId, "stop", "你是詐騙，我要自行查證");
      await until(() => h.agents.calls.some((v) => v.kind === "watch"));
      const evidence = h.store.get(id).messages.at(-1).id;
      if (order === "persona-first")
        reply.resolve({ text: "不應發布的文字", requestHangup: false });
      watch.resolve({
        stop: true,
        reason: "達標",
        evidenceIds: [evidence],
      });
      await until(() => h.store.get(id).state === "completed");
      reply.resolve({ text: "不應發布的文字", requestHangup: false });
      await new Promise((r) => setTimeout(r, 5));
      expect(
        h.store.get(id).messages.some((m) => m.text === "不應發布的文字"),
      ).toBe(false);
      expect(h.store.get(id).recaps).toHaveLength(1);
      expect(h.store.get(id).calls[0].endReason).toBe("judge");
    },
  );
  it("manual hangup ignores late rejection and duplicate close does not stop next call", async () => {
    const reply = deferred();
    let replies = 0;
    const base = fixtureAgents();
    const h = make({
      reply: (ctx, signal) =>
        ++replies === 1 ? base.run("reply", ctx, signal) : reply.promise,
    });
    const { id, callId } = await ready(h);
    h.engine.send(id, callId, "wait", "好");
    await until(
      () => h.agents.calls.filter((v) => v.kind === "reply").length === 2,
    );
    h.engine.closeCall(id, callId);
    h.engine.closeCall(id, callId, "judge");
    await until(() => h.store.get(id).state === "awaiting_call");
    reply.reject(new Error("late failure"));
    await new Promise((r) => setTimeout(r, 5));
    expect(h.store.get(id).state).toBe("awaiting_call");
    expect(h.store.get(id).calls[0].endReason).toBe("user");
    expect(h.store.get(id).recaps).toHaveLength(1);
  });
  it.each(["planning", "awaiting_call", "in_call", "recapping", "reporting"])(
    "finish is safe during %s",
    async (state) => {
      const gate = deferred();
      const base = fixtureAgents();
      let planCalls = 0;
      const overrides =
        state === "planning"
          ? { plan: () => gate.promise }
          : state === "recapping"
            ? { recap: () => gate.promise }
            : state === "reporting"
              ? { report: () => gate.promise }
              : {};
      const h = make(overrides);
      let id = h.engine.start("anti-fraud");
      if (state !== "planning")
        await until(() => h.store.get(id).state === "awaiting_call");
      if (["in_call", "recapping"].includes(state)) {
        const callId = h.engine.accept(id, h.store.get(id).pendingAssignmentId);
        await until(() => !h.store.get(id).busy);
        if (state === "recapping") {
          h.engine.closeCall(id, callId);
          await until(() => h.agents.calls.some((v) => v.kind === "recap"));
        }
      }
      if (state === "reporting") {
        h.engine.finish(id);
        await until(() => h.store.get(id).state === "reporting");
      }
      planCalls = h.agents.calls.filter((v) => v.kind === "plan").length;
      h.engine.finish(id);
      h.engine.finish(id);
      if (state === "recapping") {
        const ctx = h.agents.calls.find((v) => v.kind === "recap").context;
        gate.resolve(await base.run("recap", ctx));
      }
      if (state === "reporting") {
        await until(() => h.agents.calls.some((v) => v.kind === "report"));
        const ctx = h.agents.calls.find((v) => v.kind === "report").context;
        gate.resolve(await base.run("report", ctx));
      }
      await until(() => h.store.get(id).state === "completed");
      expect(h.store.get(id).report.insufficientEvidence).toBe(true);
      expect(h.agents.calls.filter((v) => v.kind === "plan")).toHaveLength(
        planCalls,
      );
      expect(h.agents.calls.filter((v) => v.kind === "report")).toHaveLength(1);
    },
  );
  it.each(["plan", "reply", "watch", "recap", "report"])(
    "records bounded failure in %s",
    async (kind) => {
      const h = make({
        [kind]: () => {
          throw new Error("SENTINEL_SECRET");
        },
      });
      const id = h.engine.start("anti-fraud");
      if (kind !== "plan") {
        await until(() => h.store.get(id).state === "awaiting_call");
        const callId = h.engine.accept(id, h.store.get(id).pendingAssignmentId);
        if (kind !== "reply") {
          await until(() => !h.store.get(id).busy);
          if (kind === "watch") h.engine.send(id, callId, "x", "測試");
          else {
            h.engine.finish(id);
          }
        }
      }
      await until(() => h.store.get(id).state === "failed");
      expect(JSON.stringify(h.engine.view(id))).not.toContain(
        "SENTINEL_SECRET",
      );
      expect(h.store.get(id).report).toBeNull();
    },
  );
  it("Persona can request hangup", async () => {
    const h = make();
    const { id, callId } = await ready(h);
    h.engine.send(id, callId, "later", "請稍後聯繫");
    await until(() => h.store.get(id).state === "awaiting_call");
    expect(h.store.get(id).calls[0].endReason).toBe("persona");
  });
});
describe("context and contract boundaries", () => {
  it("validates identity, shared messages, evidence and input lengths", async () => {
    const h = make();
    const { id } = await ready(h);
    const s = h.store.get(id);
    const context = roleContext("plan", s);
    const base = {
      action: "reuse",
      personaId: s.personas[0].id,
      goal: "goal",
      sharedMessageIds: [],
    };
    expect(() => validateResult("plan", base, context)).not.toThrow();
    for (const bad of [
      { ...base, allowedFactIds: [] },
      { ...base, facts: [{ key: "order", value: "wrong" }] },
      { ...base, personaId: "unknown" },
      { ...base, sharedMessageIds: ["unknown"] },
    ])
      expect(() => validateResult("plan", bad, context)).toThrow();
    expect(() => inputText("😀".repeat(2001), 2000, true)).toThrow();
    expect(() => inputText(" ", 4000)).toThrow();
    const report = {
      summary: "x",
      dimensions: [{ name: "x", assessment: "x", evidenceIds: ["fake"] }],
      strengths: [],
      improvements: [],
      uncertainties: [],
      insufficientEvidence: true,
    };
    expect(() => validateResult("report", report, context)).toThrow();
  });
  it("keeps private prompts out of API view and limits Judge/Persona inputs", async () => {
    const h = make();
    const { id, callId } = await ready(h);
    h.engine.send(id, callId, "x", "好");
    await until(() => !h.store.get(id).busy);
    const view = JSON.stringify(h.engine.view(id));
    expect(view).not.toMatch(/allowedFactIds|criterionIds|"facts"|"criteria"/);
    expect(view).not.toContain("personality");
    expect(view).not.toContain("stopCondition");
    expect(view).not.toContain("prompts");
    const watch = h.agents.calls.find((v) => v.kind === "watch");
    expect(Object.keys(watch.context)).toEqual([
      "stopCondition",
      "messages",
      "endReason",
    ]);
    const reply = h.agents.calls.find((v) => v.kind === "reply");
    expect(reply.prompt).toContain("未知細節");
    expect(reply.context).not.toHaveProperty("facts");
    expect(h.store.get(id).watches[0].stop).toBe(false);
  });
});

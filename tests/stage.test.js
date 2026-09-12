import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { harness, ready, until, deferred } from "./support/fixtures.js";
import { Store } from "../packages/storage/src/store.js";
import { createApp } from "../apps/server/src/app.js";
import { streamStage } from "../apps/server/src/stage-stream.js";
import { StageDirector, snapshotScene } from "../apps/web/src/stage/scene.js";
import { connectDrill } from "../apps/web/src/stage/feed.js";

const cleanup = [];
const make = (...args) => {
  const h = harness(...args);
  cleanup.push(() => h.close());
  return h;
};
afterEach(async () => {
  vi.useRealTimers();
  for (const close of cleanup.splice(0).reverse()) await close();
});
const types = (h, id) => h.store.events(id, 0, 500).events.map((e) => e.type);

it("commits a complete ordered handoff with stable identity, deduplication and private data exclusion", async () => {
  const h = make();
  const { id, callId } = await ready(h, "interview");
  const before = h.engine.view(id);
  h.engine.accept(id, h.store.get(id).calls[0].assignmentId);
  expect(h.engine.view(id).stage).toEqual(before.stage);
  h.engine.send(id, callId, "first", "我會先查證");
  h.engine.send(id, callId, "first", "我會先查證");
  await until(() => !h.store.get(id).busy);
  h.engine.closeCall(id, callId);
  h.engine.closeCall(id, callId);
  await until(() => h.store.get(id).state === "awaiting_call");
  const events = h.store.events(id, 0, 500).events;
  expect(events.map((e) => e.sequence)).toEqual(events.map((_, i) => i + 1));
  expect(types(h, id)).toEqual([
    "planning_started",
    "persona_assigned",
    "call_started",
    "turn_started",
    "turn_completed",
    "turn_started",
    "turn_completed",
    "call_ended",
    "recap_started",
    "recap_completed",
    "planning_started",
    "persona_assigned",
  ]);
  expect(events.at(-1).action).toBe("reused");
  expect(events.at(-1).persona.spriteKey).toBe(
    before.stage.personas[0].spriteKey,
  );
  expect(h.engine.view(id).stage.currentAssignment.action).toBe("reused");
  const raw = JSON.stringify(events);
  for (const privateValue of [
    "allowedFactIds",
    "personality",
    "prompts",
    "uncertainties",
    "練習提出清楚的理由",
  ])
    expect(raw).not.toContain(privateValue);
  const count = h.agents.calls.length;
  h.store.events(id);
  h.engine.view(id);
  expect(h.agents.calls).toHaveLength(count);
});

it("rolls back event sequence, revision and state together on failed database save", async () => {
  const h = make();
  const { id, callId } = await ready(h);
  h.engine.closeCall(id, callId);
  await until(() => h.store.get(id).recaps.length === 1);
  const snapshot = h.engine.view(id),
    events = h.store.events(id);
  const broken = h.store.get(id);
  broken.recaps.push({ ...broken.recaps[0], id: "duplicate" });
  broken.state = "failed";
  let notifications = 0;
  h.store.subscribe(() => notifications++);
  expect(() => h.store.save(broken)).toThrow();
  expect(h.engine.view(id)).toEqual(snapshot);
  expect(h.store.events(id)).toEqual(events);
  expect(notifications).toBe(0);
});

it.each([1, 2])(
  "migrates a genuine v%s history and records recovery once without model work",
  async (version) => {
    const dir = mkdtempSync(join(tmpdir(), "stage-migrate-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, "db");
    const h = harness({}, path);
    const { id } = await ready(h);
    const old = h.store.get(id);
    h.engine.dispose();
    h.store.db.exec("DROP TABLE drill_stage_events");
    const row = JSON.parse(
      h.store.db.prepare("SELECT payload FROM sessions WHERE id=?").get(id)
        .payload,
    );
    delete row.stage;
    if (version === 1) {
      row.scenario = row.plot;
      delete row.plot;
      h.store.db.exec("DROP TABLE plots");
    }
    h.store.db
      .prepare("UPDATE sessions SET payload=? WHERE id=?")
      .run(JSON.stringify(row), id);
    h.store.db.pragma(`user_version=${version}`);
    h.store.close();
    const store = new Store(path);
    cleanup.push(() => store.close());
    expect(store.events(id).events).toEqual([]);
    expect(store.get(id).messages).toEqual(old.messages);
    store.recover();
    store.recover();
    expect(store.db.pragma("user_version", { simple: true })).toBe(3);
    expect(store.events(id).events.map((e) => e.type)).toEqual([
      "call_ended",
      "drill_interrupted",
    ]);
    expect(store.get(id).stage.personas[0].spriteKey).toBe("persona-01");
  },
);

it("does not fabricate a completed recap when cancelled work fails or returns late", async () => {
  const gate = deferred();
  const h = make({ recap: () => gate.promise });
  const { id, callId } = await ready(h);
  h.engine.closeCall(id, callId);
  await until(() => h.agents.calls.some((c) => c.kind === "recap"));
  expect(types(h, id).at(-1)).toBe("recap_started");
  gate.reject(new Error("private-error"));
  await until(() => h.store.get(id).state === "failed");
  expect(types(h, id).at(-1)).toBe("drill_failed");
  expect(types(h, id)).not.toContain("recap_completed");
  expect(JSON.stringify(h.store.events(id))).not.toContain("private-error");
});

it("validates paginated public APIs and streams committed events across reconnects", async () => {
  const h = harness();
  const app = await createApp(h.engine);
  cleanup.push(() => app.close());
  const { id, callId } = await ready(h);
  const url = await app.listen({ host: "127.0.0.1", port: 0 });
  for (const [query, status] of [
    ["after=-1", 400],
    ["after=1.2", 400],
    ["after=99999", 409],
    ["limit=501", 400],
    ["limit=0", 400],
  ])
    expect(
      (await app.inject(`/api/drills/${id}/events?${query}`)).statusCode,
    ).toBe(status);
  expect((await app.inject("/api/drills/missing/events")).statusCode).toBe(404);
  const first = (await app.inject(`/api/drills/${id}/events?limit=2`)).json();
  expect(first.events).toHaveLength(2);
  expect(first.hasMore).toBe(true);
  expect(
    (
      await app.inject(`/api/drills/${id}/events?after=${first.nextCursor}`)
    ).json().events[0].sequence,
  ).toBe(3);
  const ac = new AbortController();
  cleanup.push(() => ac.abort());
  const response = await fetch(
    `${url}/api/drills/${id}/events/stream?after=0`,
    { headers: { "Last-Event-ID": "2" }, signal: ac.signal },
  );
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  const reader = response.body.getReader();
  let output = "";
  const consume = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += new TextDecoder().decode(value);
      }
    } catch {
      /* aborted */
    }
  })();
  await until(() => output.includes("event: snapshot"));
  expect(output).not.toContain("id: 1\n");
  expect(output).toContain("id: 3\n");
  h.engine.send(id, callId, "stream", "測試串流");
  await until(() => !h.store.get(id).busy);
  h.engine.finish(id);
  await until(() => h.store.get(id).state === "completed");
  await consume;
  expect(output).toContain("drill_completed");
  const seen = output
    .split("\n")
    .filter((v) => v.startsWith("id: "))
    .map((v) => Number(v.slice(4)));
  expect(seen).toEqual(
    h.store.events(id, 2, 500).events.map((e) => e.sequence),
  );
  await until(() => h.store.listeners.size === 0);
});

it("keeps slow-client buffers bounded and releases subscribers on timeout/shutdown", async () => {
  const h = make();
  const { id } = await ready(h);
  vi.useFakeTimers();
  class Socket extends EventEmitter {
    writableLength = 600000;
    write() {
      return false;
    }
    end() {
      this.ended = true;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const socket = new Socket();
  streamStage(h.engine, id, 0, socket);
  await vi.advanceTimersByTimeAsync(1);
  expect(socket.destroyed).toBe(true);
  expect(h.store.listeners.size).toBe(0);
  const blocked = new Socket();
  blocked.writableLength = 100;
  streamStage(h.engine, id, 0, blocked);
  await vi.advanceTimersByTimeAsync(15001);
  expect(blocked.destroyed).toBe(true);
  expect(h.store.listeners.size).toBe(0);
  const healthy = new Socket();
  healthy.write = () => true;
  healthy.writableLength = 0;
  const close = streamStage(h.engine, id, 0, healthy);
  await vi.advanceTimersByTimeAsync(1);
  close();
  expect(healthy.ended).toBe(true);
  expect(h.store.listeners.size).toBe(0);
});

it("paces handoff only after completed recap, bounds lag and cancels motion on finish/reduced mode", async () => {
  const h = make();
  const { id, callId } = await ready(h);
  const snapshot = h.engine.view(id);
  vi.useFakeTimers();
  let scene;
  const d = new StageDirector((s) => (scene = s));
  cleanup.push(() => d.dispose());
  d.reset(snapshot);
  const recap = {
    ...snapshot,
    state: "recapping",
    calls: snapshot.calls.map((c) => ({ ...c, endedAt: "now" })),
  };
  const e = (sequence, type) => ({ sequence, drillId: id, type, callId });
  const n = snapshot.stage.lastEventSequence;
  d.update(recap, [e(n + 1, "call_ended"), e(n + 2, "recap_started")]);
  await vi.advanceTimersByTimeAsync(1300);
  expect(scene.judge.position).toBe("report");
  expect(scene.judge.handoff).not.toBe(true);
  d.update({ ...recap, state: "planning" }, [
    e(n + 3, "recap_completed"),
    e(n + 4, "planning_started"),
  ]);
  expect(scene.judge.handoff).toBe(true);
  await vi.advanceTimersByTimeAsync(3000);
  expect(scene.mastermind.bubble).toContain("安排");
  const person = snapshot.stage.personas[0];
  const burst = Array.from({ length: 20 }, (_, i) => ({
    ...e(n + 5 + i, "persona_assigned"),
    persona: person,
    action: "reused",
  }));
  d.update({ ...snapshot, state: "awaiting_call" }, burst);
  await vi.advanceTimersByTimeAsync(2999);
  expect(d.queue).toHaveLength(0);
  expect(scene.persona.position).toBe("call");
  d.update({ ...snapshot, state: "failed" }, []);
  expect(scene.persona).toBeNull();
  expect(d.queue).toHaveLength(0);
  d.update(snapshot, [], true);
  expect(scene).toMatchObject(snapshotScene(snapshot));
  expect(scene.judge.moveMs).toBe(0);
  expect(scene.persona.moveMs).toBe(0);
});

it("read-only feed deduplicates, rejects stale snapshots, catches gaps, restores and cleans up", async () => {
  const h = make();
  const { id } = await ready(h);
  const base = h.engine.view(id);
  let snapshot = base,
    source,
    callbackEvents = [],
    snapshots = [],
    resets = 0;
  const visibility = new EventTarget();
  visibility.hidden = false;
  const extra = {
    drillId: id,
    sequence: base.stage.lastEventSequence + 1,
    revision: base.stage.revision + 1,
    type: "planning_started",
  };
  const feed = connectDrill({
    id,
    visibility,
    getSnapshot: async () => snapshot,
    getEvents: async (after) => ({
      events: after < extra.sequence ? [extra] : [],
      hasMore: false,
    }),
    source: () => {
      source = new EventTarget();
      source.close = vi.fn();
      return source;
    },
    onSnapshot: (s) => snapshots.push(s),
    onEvent: (e) => callbackEvents.push(e),
    onReset: () => resets++,
    onStatus: () => {},
  });
  cleanup.push(() => feed.close());
  await until(() => source);
  const emit = (type, value) =>
    source.dispatchEvent(
      new MessageEvent(type, { data: JSON.stringify(value) }),
    );
  emit("stage", extra);
  emit("stage", extra);
  expect(callbackEvents).toHaveLength(1);
  snapshot = {
    ...base,
    busy: true,
    stage: {
      ...base.stage,
      revision: extra.revision,
      lastEventSequence: extra.sequence,
    },
  };
  emit("snapshot", snapshot);
  feed.acceptSnapshot(base);
  expect(snapshots.at(-1).busy).toBe(true);
  visibility.hidden = true;
  visibility.dispatchEvent(new Event("visibilitychange"));
  expect(source.close).toHaveBeenCalled();
  visibility.hidden = false;
  visibility.dispatchEvent(new Event("visibilitychange"));
  await until(() => resets === 2);
  expect(callbackEvents).toHaveLength(1);
  // A gap must cause catch-up, not publish the out-of-order event.
  emit("stage", { ...extra, sequence: extra.sequence + 2 });
  await until(() => source.close.mock.calls.length > 0);
  expect(callbackEvents).toHaveLength(1);
  feed.close();
});

it("fills a live event gap from persisted pages and ignores a stale bootstrap after foreground restore", async () => {
  const h = make();
  const { id } = await ready(h);
  const base = h.engine.view(id);
  const n = base.stage.lastEventSequence;
  const events = [
    { drillId: id, sequence: n + 1, type: "recap_completed" },
    { drillId: id, sequence: n + 2, type: "planning_started" },
  ];
  const latest = {
    ...base,
    stage: {
      ...base.stage,
      revision: base.stage.revision + 1,
      lastEventSequence: n + 2,
    },
  };
  const visibility = new EventTarget();
  visibility.hidden = false;
  let src,
    reads = 0;
  const received = [],
    shown = [];
  const feed = connectDrill({
    id,
    visibility,
    getSnapshot: async () => (++reads === 1 ? base : latest),
    getEvents: async (after) => ({
      events: events.filter((e) => e.sequence > after),
      hasMore: false,
    }),
    source: () => {
      src = new EventTarget();
      src.close = vi.fn();
      return src;
    },
    onSnapshot: (s) => shown.push(s),
    onEvent: (e) => received.push(e),
    onReset: () => {},
    onStatus: () => {},
  });
  cleanup.push(() => feed.close());
  await until(() => src);
  src.dispatchEvent(
    new MessageEvent("stage", { data: JSON.stringify(events[1]) }),
  );
  await until(() => received.length === 2);
  expect(received).toEqual(events);
  expect(shown.at(-1)).toEqual(latest);
  feed.close();
  const slow = deferred();
  let read = 0;
  const restored = [];
  const second = connectDrill({
    id,
    visibility,
    getSnapshot: () => (++read === 1 ? slow.promise : Promise.resolve(latest)),
    getEvents: async () => ({ events: [], hasMore: false }),
    source: () => {
      const e = new EventTarget();
      e.close = () => {};
      return e;
    },
    onSnapshot: (s) => restored.push(s),
    onEvent: () => {},
    onReset: () => {},
    onStatus: () => {},
  });
  cleanup.push(() => second.close());
  visibility.dispatchEvent(new Event("visibilitychange"));
  await until(() => restored.length === 1);
  slow.resolve(base);
  await new Promise((r) => setTimeout(r, 5));
  expect(restored).toEqual([latest]);
});

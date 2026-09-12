import { afterEach, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/storage/src/store.js";
import { loadConfig, liveConfiguration } from "../apps/server/src/config.js";
import { liveSessionOptions } from "../packages/core/src/voice-context.js";
import { sessionConfig } from "../packages/gpt-live/src/config.js";
import { harness, ready } from "./support/fixtures.js";
import { transcript } from "./support/voice.js";
const cleanups = [];
afterEach(() => {
  for (const fn of cleanups.splice(0).reverse()) fn();
});
async function setup() {
  const h = harness();
  cleanups.push(() => h.close());
  const { id, callId } = await ready(h);
  h.store.voice.create(id, callId, "voice");
  return { ...h, id, callId, records: h.store.voice };
}
it("text and voice share API_KEY with environment precedence and safe optional settings", () => {
  expect(liveConfiguration({})).toEqual({
    available: false,
    reason: "NOT_CONFIGURED",
  });
  expect(
    liveConfiguration({
      API_KEY: "KEY_SENTINEL",
      OPENAI_BASE_URL: "https://user:secret@bad.test",
    }),
  ).toEqual({ available: false, reason: "INVALID_CONFIG" });
  const dir = mkdtempSync(join(tmpdir(), "voice-env-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(
    join(dir, ".env"),
    "API_KEY=KEY_SENTINEL\nLLM_BASE_URL=https://text.test/v1\nLLM_MODEL=test\nLIVE_VOICE=cedar\n",
  );
  const config = loadConfig(dir, { LIVE_VOICE: "marin" });
  expect(config.live).toMatchObject({
    available: true,
    voice: "marin",
    config: { apiKey: "KEY_SENTINEL", baseURL: "https://api.openai.com/v1" },
  });
  expect(config.apiKey).toBe("KEY_SENTINEL");
  const overridden = loadConfig(dir, {
    API_KEY: "ENV_SENTINEL",
    LLM_API_KEY: "LEGACY_SENTINEL",
    OPENAI_API_KEY: "IGNORED_SENTINEL",
  });
  expect(overridden.apiKey).toBe("ENV_SENTINEL");
  expect(overridden.live.config.apiKey).toBe("ENV_SENTINEL");
  const invalidVoice = loadConfig(dir, { OPENAI_BASE_URL: "invalid" });
  expect(invalidVoice.apiKey).toBe("KEY_SENTINEL");
  expect(invalidVoice.live).toEqual({
    available: false,
    reason: "INVALID_CONFIG",
  });
});
it("legacy text-only configuration still works and OPENAI_API_KEY never enables voice", () => {
  const dir = mkdtempSync(join(tmpdir(), "voice-legacy-env-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const values = {
    LLM_API_KEY: "LEGACY_SENTINEL",
    LLM_BASE_URL: "https://text.test/v1",
    LLM_MODEL: "test",
    OPENAI_API_KEY: "IGNORED_SENTINEL",
  };
  const config = loadConfig(dir, values);
  expect(config.apiKey).toBe("LEGACY_SENTINEL");
  expect(config.live).toEqual({ available: false, reason: "NOT_CONFIGURED" });
  expect(
    liveConfiguration({ API_KEY: "  ", OPENAI_API_KEY: "IGNORED_SENTINEL" }),
  ).toEqual({ available: false, reason: "NOT_CONFIGURED" });
  expect(() => loadConfig(dir, { ...values, LLM_API_KEY: "" })).toThrow(
    "API_KEY",
  );
});
it("preserves exact fragments, overlaps, duplicate IDs, repeated speech, whitespace and late evidence", async () => {
  const h = await setup();
  const add = (e) => h.records.ingest(h.id, "voice", e);
  add({ ...transcript(" 好", "user", 10, "a"), private: "PRIVATE_SENTINEL" });
  expect(add(transcript(" 好", "user", 10, "a"))).toBeNull();
  add(transcript(" 好", "user", 50, "b"));
  add(transcript("同時", "persona", 20));
  const first = h.records.checkpoint(h.id, "voice");
  expect(first.map((m) => m.text)).toEqual([" 好 好", "同時"]);
  expect(first[0]).toMatchObject({
    source: "voice",
    partial: true,
    startMs: 10,
    endMs: 90,
  });
  expect(first[1].playback).toBe("unconfirmed");
  add(transcript("晚到", "user", 5));
  add(transcript("晚到", "user", 5));
  expect(h.records.checkpoint(h.id, "voice")[0]).toMatchObject({
    text: "晚到晚到",
    late: true,
  });
  add(transcript(" \n", "user", 100));
  expect(h.records.checkpoint(h.id, "voice")).toEqual([]);
  add(transcript("好", "user", 140));
  expect(h.records.checkpoint(h.id, "voice")[0].text).toBe(" \n好");
  expect(h.store.get(h.id).messages.find((m) => m.id === first[0].id)).toEqual(
    first[0],
  );
  expect(JSON.stringify(h.engine.view(h.id))).not.toMatch(
    /PRIVATE_SENTINEL|providerId|instructions|event_id/,
  );
  expect(() => h.records.create(h.id, "invalid-call", "other")).toThrow(
    /FOREIGN KEY/,
  );
});
it("splits oversized Unicode evidence with exact source spans and never stores private/audio events", async () => {
  const h = await setup(),
    text = "😀".repeat(4500);
  const source = h.records.ingest(h.id, "voice", transcript(text));
  const messages = h.records.checkpoint(h.id, "voice");
  expect(messages.map((m) => [...m.text].length)).toEqual([4000, 500]);
  expect(messages[1].fragmentSpans).toEqual([
    { id: source.id, start: 4000, end: 4500 },
  ]);
  expect(messages.map((m) => m.text).join("")).toBe(text);
  expect(h.records.checkpoint(h.id, "voice", true)).toEqual([]);
  for (const e of [
    { type: "session.output_audio.delta", delta: "AAA=" },
    { ...transcript("bad"), start_ms: -1 },
    { ...transcript("bad"), end_ms: NaN },
  ])
    expect(() => h.records.ingest(h.id, "voice", e)).toThrow();
});
it("migrates a version-1 text database transactionally and recovers committed pending voice without agents", async () => {
  const dir = mkdtempSync(join(tmpdir(), "voice-db-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "history.sqlite"),
    original = harness({}, path);
  const { id, callId } = await ready(original);
  const before = original.store.get(id).messages;
  original.close();
  const v1 = new Database(path);
  v1.exec(
    "DROP TABLE voice_fragments; DROP TABLE voice_attempts; PRAGMA user_version=1;",
  );
  v1.close();
  let store = new Store(path);
  expect(store.db.pragma("user_version", { simple: true })).toBe(4);
  expect(store.get(id).messages).toEqual(before);
  expect(store.db.pragma("foreign_key_check")).toEqual([]);
  store.voice.create(id, callId, "pending");
  store.voice.ingest(id, "pending", transcript("尚未檢查的話"));
  store.close();
  store = new Store(path);
  cleanups.push(() => store.close());
  store.recover();
  expect(store.get(id).state).toBe("interrupted");
  expect(store.get(id).messages.at(-1).text).toBe("尚未檢查的話");
  expect(store.voice.get(id, "pending")).toMatchObject({
    status: "interrupted",
    finalized: false,
  });
  store.recover();
  expect(store.get(id).messages).toHaveLength(before.length + 1);
});
it("Live context has scoped identity, stable per-Persona voices, and no Judge state", async () => {
  const h = await setup(),
    s = h.store.get(h.id),
    call = s.calls[0];
  s.calls.push({ id: "private-call", personaId: "someone-else" });
  s.messages.push({
    id: "private",
    callId: "private-call",
    text: "OTHER_PERSONA_SENTINEL",
    speaker: "user",
  });
  s.watches.push({ reason: "JUDGE_SENTINEL" });
  s.personas.push({
    id: "second-persona",
    name: "第二位",
    role: "複核員",
    personality: "謹慎",
  });
  const secondCall = {
    ...call,
    id: "second-call",
    personaId: "second-persona",
  };
  const options = liveSessionOptions(s, call),
    json = JSON.stringify(options);
  expect(json).not.toMatch(/OTHER_PERSONA_SENTINEL|JUDGE_SENTINEL|JSON Schema/);
  expect(json).toContain("林小姐");
  expect(options.input[0].content[0].text).toContain("你好");
  expect(options.voice).toBe("marin");
  expect(liveSessionOptions(s, secondCall).voice).toBe("cedar");
  expect(liveSessionOptions(s, { ...call, id: "repeat" }).voice).toBe("marin");
  expect(sessionConfig(options, true)).toMatchObject({
    model: "gpt-live-1",
    store: false,
    delegation: { type: "client" },
    audio: { format: { rate: 24000 } },
  });
});

it.each(["voice-v2", "main-v3"])(
  "upgrades %s history to the combined schema without losing evidence or identity",
  async (branch) => {
    const dir = mkdtempSync(join(tmpdir(), "voice-merge-db-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, "history.sqlite");
    const original = harness({}, path);
    const { id, callId } = await ready(original);
    const before = original.store.get(id);
    const plots = original.store.listPlots();
    const events = original.store.events(id);
    if (branch === "voice-v2") {
      original.store.voice.create(id, callId, "pending");
      original.store.voice.ingest(
        id,
        "pending",
        transcript("保留舊分支的語音"),
      );
    }
    original.close();
    const old = new Database(path);
    if (branch === "voice-v2") {
      const row = JSON.parse(
        old.prepare("SELECT payload FROM sessions WHERE id=?").get(id).payload,
      );
      row.scenario = row.plot;
      delete row.plot;
      delete row.stage;
      old
        .prepare("UPDATE sessions SET payload=? WHERE id=?")
        .run(JSON.stringify(row), id);
      old.exec(
        "DROP TABLE plots; DROP TABLE drill_stage_events; PRAGMA user_version=2;",
      );
    } else {
      old.exec(
        "DROP TABLE voice_fragments; DROP TABLE voice_attempts; PRAGMA user_version=3;",
      );
    }
    old.close();
    let store = new Store(path);
    expect(store.db.pragma("user_version", { simple: true })).toBe(4);
    expect(store.get(id)).toMatchObject({
      plot: before.plot,
      calls: before.calls,
      messages: before.messages,
    });
    expect(store.get(id).scenario).toBeUndefined();
    if (branch === "main-v3") {
      expect(store.listPlots()).toEqual(plots);
      expect(store.events(id)).toEqual(events);
      expect(store.get(id).stage).toEqual(before.stage);
    } else {
      expect(store.events(id).events).toEqual([]);
      expect(store.voice.fragments(id, "pending")).toHaveLength(1);
    }
    store.recover();
    const recovered = store.get(id);
    const recoveryEvents = store.events(id);
    expect(recovered.calls[0]).toMatchObject({
      id: callId,
      inputMode: "text",
      endReason: "interrupted",
    });
    if (branch === "voice-v2") {
      expect(recovered.messages.at(-1).text).toBe("保留舊分支的語音");
      expect(store.voice.get(id, "pending").status).toBe("interrupted");
      expect(recoveryEvents.events.map((e) => e.type)).toEqual([
        "call_ended",
        "drill_interrupted",
      ]);
    }
    expect(store.db.pragma("foreign_key_check")).toEqual([]);
    store.close();
    store = new Store(path);
    cleanups.push(() => store.close());
    store.recover();
    expect(store.get(id)).toEqual(recovered);
    expect(store.events(id)).toEqual(recoveryEvents);
  },
);

it("rolls back a failed branch migration without changing the old schema or version", async () => {
  const dir = mkdtempSync(join(tmpdir(), "voice-rollback-db-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "history.sqlite");
  const original = harness({}, path);
  const { id } = await ready(original);
  original.close();
  const old = new Database(path);
  old.exec(
    "DROP TABLE plots; DROP TABLE drill_stage_events; PRAGMA user_version=2;",
  );
  old.prepare("UPDATE sessions SET payload=? WHERE id=?").run("{invalid", id);
  const schema = old
    .prepare("SELECT name,sql FROM sqlite_master ORDER BY name")
    .all();
  old.close();
  expect(() => new Store(path)).toThrow();
  const check = new Database(path);
  cleanups.push(() => check.close());
  expect(check.pragma("user_version", { simple: true })).toBe(2);
  expect(
    check.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all(),
  ).toEqual(schema);
  expect(
    check.prepare("SELECT payload FROM sessions WHERE id=?").get(id).payload,
  ).toBe("{invalid");
});

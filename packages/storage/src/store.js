import { VoiceRecords } from "./voice.js";
import { stageMetadata, stageEvents } from "../../core/src/stage.js";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  terminal,
  conflict,
  missing,
  AppError,
} from "../../core/src/contracts.js";
import {
  parsePlot,
  plotSchema,
  plotDefinitionSchema,
} from "../../core/src/plot-contracts.js";

export const databaseSchemaVersion = 4;
const collections = [
  "personas",
  "assignments",
  "calls",
  "messages",
  "watches",
  "recaps",
];
export class Store {
  constructor(path = ":memory:") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = WAL");
    const version = this.db.pragma("user_version", { simple: true });
    this.listeners = new Set();
    if (version > databaseSchemaVersion) {
      this.db.close();
      throw new Error("資料庫版本較新，請使用相容的程式。");
    }
    const hasTable = (name) =>
      !!this.db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
        .get(name);
    try {
      this.db.transaction(() => {
        if (!version)
          this.db.transaction(() => {
            this.db.exec(`
        CREATE TABLE sessions (id TEXT PRIMARY KEY, state TEXT NOT NULL, payload TEXT NOT NULL);
        CREATE UNIQUE INDEX one_active_session ON sessions((1)) WHERE state NOT IN ('completed','failed','interrupted');
        CREATE TABLE personas (session_id TEXT REFERENCES sessions(id), id TEXT, payload TEXT NOT NULL, PRIMARY KEY(session_id,id));
        CREATE TABLE assignments (session_id TEXT REFERENCES sessions(id), id TEXT, persona_id TEXT, payload TEXT NOT NULL, PRIMARY KEY(session_id,id), FOREIGN KEY(session_id,persona_id) REFERENCES personas(session_id,id));
        CREATE TABLE calls (session_id TEXT REFERENCES sessions(id), id TEXT, persona_id TEXT, assignment_id TEXT, payload TEXT NOT NULL, PRIMARY KEY(session_id,id), FOREIGN KEY(session_id,persona_id) REFERENCES personas(session_id,id), FOREIGN KEY(session_id,assignment_id) REFERENCES assignments(session_id,id));
        CREATE TABLE messages (session_id TEXT REFERENCES sessions(id), id TEXT, call_id TEXT, client_id TEXT, sequence INTEGER, payload TEXT NOT NULL, PRIMARY KEY(session_id,id), UNIQUE(session_id,client_id), UNIQUE(session_id,sequence), FOREIGN KEY(session_id,call_id) REFERENCES calls(session_id,id));
        CREATE TABLE watches (session_id TEXT REFERENCES sessions(id), id TEXT, call_id TEXT, payload TEXT NOT NULL, PRIMARY KEY(session_id,id), FOREIGN KEY(session_id,call_id) REFERENCES calls(session_id,id));
        CREATE TABLE recaps (session_id TEXT REFERENCES sessions(id), id TEXT, call_id TEXT, payload TEXT NOT NULL, PRIMARY KEY(session_id,id), UNIQUE(session_id,call_id), FOREIGN KEY(session_id,call_id) REFERENCES calls(session_id,id));
        CREATE TABLE reports (session_id TEXT PRIMARY KEY REFERENCES sessions(id), payload TEXT NOT NULL);
        PRAGMA user_version = 1;
      `);
          })();
        if (version < 2 || !hasTable("plots"))
          this.db.transaction(() => {
            this.db.exec(
              "CREATE TABLE IF NOT EXISTS plots (id TEXT PRIMARY KEY, version INTEGER NOT NULL, payload TEXT NOT NULL)",
            );
            for (const row of this.db
              .prepare("SELECT id,payload FROM sessions")
              .all()) {
              const data = JSON.parse(row.payload);
              if (data.scenario) {
                data.plot = data.scenario;
                delete data.scenario;
                this.db
                  .prepare("UPDATE sessions SET payload=? WHERE id=?")
                  .run(JSON.stringify(data), row.id);
              }
            }
            this.db.pragma("user_version = 2");
          })();

        if (version < 3)
          this.db.transaction(() => {
            this.db.exec(
              "CREATE TABLE IF NOT EXISTS drill_stage_events (session_id TEXT NOT NULL REFERENCES sessions(id), sequence INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(session_id,sequence))",
            );
            for (const row of this.db
              .prepare("SELECT id FROM sessions")
              .all()) {
              const drill = this.get(row.id);
              const meta = JSON.parse(
                this.db
                  .prepare("SELECT payload FROM sessions WHERE id=?")
                  .get(row.id).payload,
              );
              meta.stage = stageMetadata(drill, meta.stage);
              this.db
                .prepare("UPDATE sessions SET payload=? WHERE id=?")
                .run(JSON.stringify(meta), row.id);
            }
            this.db.pragma("user_version = 3");
          })();
        this.voice = new VoiceRecords(this);
        this.db.pragma("user_version = 4");
      })();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  events(id, after = 0, limit = 100) {
    const row = this.db
      .prepare("SELECT payload FROM sessions WHERE id=?")
      .get(id);
    if (!row) throw missing();
    if (
      !Number.isSafeInteger(after) ||
      after < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 500
    )
      throw new AppError("INVALID_CURSOR", "事件游標或筆數不正確。", 400);
    const latestSequence =
      JSON.parse(row.payload).stage?.lastEventSequence || 0;
    if (after > latestSequence)
      throw new AppError("CURSOR_AHEAD", "請重新取得最新演練狀態。", 409);
    const events = this.db
      .prepare(
        "SELECT payload FROM drill_stage_events WHERE session_id=? AND sequence>? ORDER BY sequence LIMIT ?",
      )
      .all(id, after, limit)
      .map((r) => JSON.parse(r.payload));
    const nextCursor = events.at(-1)?.sequence ?? after;
    return {
      events,
      nextCursor,
      hasMore: nextCursor < latestSequence,
      latestSequence,
    };
  }
  seedPlots(plots) {
    this.db.transaction(() => {
      for (const input of plots) {
        const plot = parsePlot(input, plotSchema);
        this.db
          .prepare("INSERT INTO plots VALUES(?,?,?) ON CONFLICT(id) DO NOTHING")
          .run(plot.id, plot.version, JSON.stringify(plot));
      }
    })();
  }
  listPlots() {
    return this.db
      .prepare("SELECT payload FROM plots ORDER BY rowid")
      .all()
      .map(({ payload }) => JSON.parse(payload));
  }
  getPlot(id) {
    const row = this.db.prepare("SELECT payload FROM plots WHERE id=?").get(id);
    if (!row) throw new AppError("PLOT_NOT_FOUND", "找不到指定的劇本。", 404);
    return JSON.parse(row.payload);
  }
  createPlot(input) {
    const plot = { ...parsePlot(input), id: randomUUID(), version: 1 };
    this.db
      .prepare("INSERT INTO plots VALUES(?,?,?)")
      .run(plot.id, plot.version, JSON.stringify(plot));
    return plot;
  }
  updatePlot(id, input) {
    const { version, ...definition } = parsePlot(
      input,
      plotDefinitionSchema.extend({ version: plotSchema.shape.version }),
    );
    const plot = { ...definition, id, version: version + 1 };
    this.getPlot(id);
    const result = this.db
      .prepare("UPDATE plots SET version=?,payload=? WHERE id=? AND version=?")
      .run(plot.version, JSON.stringify(plot), id, version);
    if (!result.changes)
      throw new AppError(
        "PLOT_CONFLICT",
        "劇本已在其他分頁更新。草稿已保留，請重新載入最新版本後再修改。",
        409,
      );
    return plot;
  }
  active() {
    return this.db
      .prepare(
        "SELECT id FROM sessions WHERE state NOT IN ('completed','failed','interrupted')",
      )
      .get()?.id;
  }
  list() {
    return this.db
      .prepare("SELECT payload FROM sessions ORDER BY rowid DESC")
      .all()
      .map(({ payload }) => JSON.parse(payload));
  }
  get(id) {
    const row = this.db
      .prepare("SELECT payload FROM sessions WHERE id=?")
      .get(id);
    if (!row) throw missing();
    const s = JSON.parse(row.payload);
    for (const table of collections)
      s[table] = this.db
        .prepare(
          `SELECT payload FROM ${table} WHERE session_id=? ORDER BY rowid`,
        )
        .all(id)
        .map((r) => JSON.parse(r.payload));
    const report = this.db
      .prepare("SELECT payload FROM reports WHERE session_id=?")
      .get(id);
    s.report = report ? JSON.parse(report.payload) : null;
    return s;
  }
  save(drill) {
    let stage;
    this.db.transaction(() => {
      const exists = this.db
        .prepare("SELECT id FROM sessions WHERE id=?")
        .get(drill.id);
      const before = exists ? this.get(drill.id) : null;
      stage = stageMetadata(drill, before?.stage);
      stage.revision++;
      const events = stageEvents(before, drill, stage).map((event) => ({
        ...event,
        drillId: drill.id,
        sequence: ++stage.lastEventSequence,
        revision: stage.revision,
        occurredAt: new Date().toISOString(),
      }));
      const {
        personas,
        assignments,
        calls,
        messages,
        watches,
        recaps,
        report,
        ...meta
      } = drill;
      this.db
        .prepare(
          "INSERT INTO sessions VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,payload=excluded.payload",
        )
        .run(drill.id, drill.state, JSON.stringify({ ...meta, stage }));
      for (const event of events)
        this.db
          .prepare("INSERT INTO drill_stage_events VALUES(?,?,?)")
          .run(drill.id, event.sequence, JSON.stringify(event));
      for (const p of personas)
        this.db
          .prepare(
            "INSERT INTO personas VALUES(?,?,?) ON CONFLICT(session_id,id) DO UPDATE SET payload=excluded.payload",
          )
          .run(drill.id, p.id, JSON.stringify(p));
      for (const a of assignments)
        this.db
          .prepare(
            "INSERT INTO assignments VALUES(?,?,?,?) ON CONFLICT(session_id,id) DO UPDATE SET payload=excluded.payload",
          )
          .run(drill.id, a.id, a.personaId, JSON.stringify(a));
      for (const c of calls)
        this.db
          .prepare(
            "INSERT INTO calls VALUES(?,?,?,?,?) ON CONFLICT(session_id,id) DO UPDATE SET payload=excluded.payload",
          )
          .run(drill.id, c.id, c.personaId, c.assignmentId, JSON.stringify(c));
      for (const m of messages)
        this.db
          .prepare(
            "INSERT INTO messages VALUES(?,?,?,?,?,?) ON CONFLICT(session_id,id) DO NOTHING",
          )
          .run(
            drill.id,
            m.id,
            m.callId,
            m.clientMessageId || null,
            m.sequence,
            JSON.stringify(m),
          );
      for (const [table, items] of [
        ["watches", watches],
        ["recaps", recaps],
      ])
        for (const entry of items)
          this.db
            .prepare(
              `INSERT INTO ${table} VALUES(?,?,?,?) ON CONFLICT(session_id,id) DO NOTHING`,
            )
            .run(drill.id, entry.id, entry.callId, JSON.stringify(entry));
      if (report)
        this.db
          .prepare(
            "INSERT INTO reports VALUES(?,?) ON CONFLICT(session_id) DO NOTHING",
          )
          .run(drill.id, JSON.stringify(report));
    })();
    drill.stage = stage;
    for (const listener of this.listeners) {
      try {
        listener(drill.id);
      } catch {
        /* Transport failure cannot undo a committed drill. */
      }
    }
  }
  create(s) {
    if (this.active())
      throw Object.assign(conflict(), { activeId: this.active() });
    this.save(s);
  }
  recover() {
    for (const row of this.list()) {
      for (const attempt of this.voice.attempts(row.id)) {
        if (["closed", "failed", "interrupted"].includes(attempt.status))
          continue;
        this.voice.checkpoint(row.id, attempt.id, true);
        this.voice.update(row.id, attempt.id, {
          status: "interrupted",
          endedAt: new Date().toISOString(),
          reason: "interrupted",
          finalized: false,
        });
      }
      if (terminal(row.state)) continue;
      const s = this.get(row.id);
      s.state = "interrupted";
      s.version++;
      s.busy = false;
      s.error = {
        code: "INTERRUPTED",
        message: "服務已重新啟動，這場演練已中斷。既有紀錄仍可查看。",
      };
      for (const call of s.calls.filter((c) => !c.endedAt)) {
        call.endedAt = new Date().toISOString();
        call.endReason = "interrupted";
        call.inputMode = "text";
      }
      this.save(s);
    }
  }
  close() {
    this.listeners.clear();
    this.db.close();
  }
}

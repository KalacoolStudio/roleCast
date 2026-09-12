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
    if (version > 2) {
      this.db.close();
      throw new Error("資料庫版本較新，請使用相容的程式。");
    }
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
    if (version < 2)
      this.db.transaction(() => {
        this.db.exec(
          "CREATE TABLE plots (id TEXT PRIMARY KEY, version INTEGER NOT NULL, payload TEXT NOT NULL)",
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
    this.db.transaction(() => {
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
        .run(drill.id, drill.state, JSON.stringify(meta));
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
  }
  create(s) {
    if (this.active())
      throw Object.assign(conflict(), { activeId: this.active() });
    this.save(s);
  }
  recover() {
    for (const row of this.list().filter((s) => !terminal(s.state))) {
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
      }
      this.save(s);
    }
  }
  close() {
    this.db.close();
  }
}

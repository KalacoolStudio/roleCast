import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { terminal, conflict, missing } from "../../core/src/contracts.js";

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
    if (version > 1) {
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
  save(session) {
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
      } = session;
      this.db
        .prepare(
          "INSERT INTO sessions VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,payload=excluded.payload",
        )
        .run(session.id, session.state, JSON.stringify(meta));
      for (const p of personas)
        this.db
          .prepare(
            "INSERT INTO personas VALUES(?,?,?) ON CONFLICT(session_id,id) DO UPDATE SET payload=excluded.payload",
          )
          .run(session.id, p.id, JSON.stringify(p));
      for (const a of assignments)
        this.db
          .prepare(
            "INSERT INTO assignments VALUES(?,?,?,?) ON CONFLICT(session_id,id) DO UPDATE SET payload=excluded.payload",
          )
          .run(session.id, a.id, a.personaId, JSON.stringify(a));
      for (const c of calls)
        this.db
          .prepare(
            "INSERT INTO calls VALUES(?,?,?,?,?) ON CONFLICT(session_id,id) DO UPDATE SET payload=excluded.payload",
          )
          .run(
            session.id,
            c.id,
            c.personaId,
            c.assignmentId,
            JSON.stringify(c),
          );
      for (const m of messages)
        this.db
          .prepare(
            "INSERT INTO messages VALUES(?,?,?,?,?,?) ON CONFLICT(session_id,id) DO NOTHING",
          )
          .run(
            session.id,
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
            .run(session.id, entry.id, entry.callId, JSON.stringify(entry));
      if (report)
        this.db
          .prepare(
            "INSERT INTO reports VALUES(?,?) ON CONFLICT(session_id) DO NOTHING",
          )
          .run(session.id, JSON.stringify(report));
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

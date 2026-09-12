import { randomUUID } from "node:crypto";
import { AppError, missing } from "../../core/src/contracts.js";

const invalid = () =>
  new AppError("VOICE_PROTOCOL", "語音資料格式不正確。", 400);
const fields = [
  "status",
  "providerId",
  "startedAt",
  "activeAt",
  "endedAt",
  "reason",
  "finalized",
  "usage",
  "errorCode",
  "elapsedMs",
];

/** Voice source data stays separate from immutable, reportable message checkpoints. */
export class VoiceRecords {
  constructor(store) {
    this.store = store;
    this.db = store.db;
    if (
      !this.db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='voice_attempts'",
        )
        .get()
    ) {
      this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE voice_attempts (
            session_id TEXT, id TEXT, call_id TEXT, payload TEXT NOT NULL,
            PRIMARY KEY(session_id,id),
            FOREIGN KEY(session_id,call_id) REFERENCES calls(session_id,id)
          );
          CREATE TABLE voice_fragments (
            session_id TEXT, id TEXT, voice_id TEXT, event_id TEXT,
            sequence INTEGER NOT NULL, checkpointed INTEGER NOT NULL DEFAULT 0,
            payload TEXT NOT NULL, PRIMARY KEY(session_id,id),
            UNIQUE(session_id,voice_id,event_id), UNIQUE(session_id,voice_id,sequence),
            FOREIGN KEY(session_id,voice_id) REFERENCES voice_attempts(session_id,id)
          );
        `);
      })();
    }
  }
  attempts(sessionId, callId) {
    return this.db
      .prepare(
        "SELECT payload FROM voice_attempts WHERE session_id=? ORDER BY rowid",
      )
      .all(sessionId)
      .map((r) => JSON.parse(r.payload))
      .filter((v) => !callId || v.callId === callId);
  }
  get(sessionId, id) {
    const row = this.db
      .prepare("SELECT payload FROM voice_attempts WHERE session_id=? AND id=?")
      .get(sessionId, id);
    if (!row) throw missing();
    return JSON.parse(row.payload);
  }
  create(sessionId, callId, id, requestId) {
    const attempt = {
      id,
      callId,
      status: "starting",
      startedAt: new Date().toISOString(),
      elapsedMs: 0,
      finalized: false,
      requestId,
    };
    this.db
      .prepare("INSERT INTO voice_attempts VALUES(?,?,?,?)")
      .run(sessionId, id, callId, JSON.stringify(attempt));
    return attempt;
  }
  update(sessionId, id, patch) {
    const attempt = this.get(sessionId, id);
    for (const field of fields)
      if (Object.hasOwn(patch, field)) attempt[field] = patch[field];
    this.db
      .prepare(
        "UPDATE voice_attempts SET payload=? WHERE session_id=? AND id=?",
      )
      .run(JSON.stringify(attempt), sessionId, id);
    return attempt;
  }
  fragments(sessionId, voiceId, pending = false) {
    return this.db
      .prepare(
        `SELECT payload FROM voice_fragments WHERE session_id=? AND voice_id=? ${pending ? "AND checkpointed=0" : ""} ORDER BY sequence`,
      )
      .all(sessionId, voiceId)
      .map((r) => JSON.parse(r.payload));
  }
  ingest(sessionId, voiceId, event) {
    const speaker =
      event.type === "session.input_transcript.delta"
        ? "user"
        : event.type === "session.output_transcript.delta"
          ? "persona"
          : null;
    if (
      !speaker ||
      typeof event.delta !== "string" ||
      event.delta.length > 16000 ||
      !Number.isFinite(event.start_ms) ||
      !Number.isFinite(event.end_ms) ||
      event.start_ms < 0 ||
      event.end_ms < event.start_ms ||
      (event.event_id != null &&
        (typeof event.event_id !== "string" ||
          !event.event_id ||
          event.event_id.length > 256))
    )
      throw invalid();
    const attempt = this.get(sessionId, voiceId);
    if (!["starting", "active"].includes(attempt.status)) throw invalid();
    const prior = this.fragments(sessionId, voiceId);
    if (
      event.event_id &&
      this.db
        .prepare(
          "SELECT 1 FROM voice_fragments WHERE session_id=? AND voice_id=? AND event_id=?",
        )
        .get(sessionId, voiceId, event.event_id)
    )
      return null;
    const previousEnd = prior
      .filter((f) => f.speaker === speaker)
      .reduce((n, f) => Math.max(n, f.endMs), 0);
    const fragment = {
      id: randomUUID(),
      voiceId,
      callId: attempt.callId,
      speaker,
      delta: event.delta,
      startMs: event.start_ms,
      endMs: event.end_ms,
      sequence: prior.length + 1,
      late: event.start_ms < previousEnd,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        "INSERT INTO voice_fragments(session_id,id,voice_id,event_id,sequence,payload) VALUES(?,?,?,?,?,?)",
      )
      .run(
        sessionId,
        fragment.id,
        voiceId,
        event.event_id ?? null,
        fragment.sequence,
        JSON.stringify(fragment),
      );
    return fragment;
  }
  checkpoint(sessionId, voiceId, final = false) {
    return this.db.transaction(() => {
      const attempt = this.get(sessionId, voiceId);
      const pending = this.fragments(sessionId, voiceId, true);
      const groups = [],
        consumed = [];
      for (const speaker of ["user", "persona"]) {
        const sources = pending.filter((f) => f.speaker === speaker);
        if (!sources.length) continue;
        if (!sources.some((f) => f.delta.trim())) {
          if (final) consumed.push(...sources);
          continue;
        }
        let group;
        for (const f of sources) {
          const chars = Array.from(f.delta);
          for (let offset = 0; offset < chars.length;) {
            if (!group || group.length === 4000) {
              group = {
                speaker,
                text: "",
                length: 0,
                fragmentSpans: [],
                startMs: f.startMs,
                endMs: f.endMs,
                late: false,
                first: f.sequence,
              };
              groups.push(group);
            }
            const end = Math.min(chars.length, offset + 4000 - group.length);
            group.text += chars.slice(offset, end).join("");
            group.length += end - offset;
            group.fragmentSpans.push({ id: f.id, start: offset, end });
            group.startMs = Math.min(group.startMs, f.startMs);
            group.endMs = Math.max(group.endMs, f.endMs);
            group.late ||= f.late;
            offset = end;
          }
        }
        consumed.push(...sources);
      }
      const s = this.store.get(sessionId);
      const messages = groups
        .filter((group) => group.text.trim())
        .sort((a, b) => a.first - b.first)
        .map(({ length: _length, first: _first, ...group }) => ({
          ...group,
          id: randomUUID(),
          callId: attempt.callId,
          voiceId,
          source: "voice",
          partial: true,
          playback: group.speaker === "persona" ? "unconfirmed" : undefined,
          sequence: s.messages.length + 1,
          createdAt: new Date().toISOString(),
        }));
      messages.forEach((m, index) => {
        m.sequence += index;
      });
      if (messages.length) {
        s.messages.push(...messages);
        this.store.save(s);
      }
      const mark = this.db.prepare(
        "UPDATE voice_fragments SET checkpointed=1 WHERE session_id=? AND id=?",
      );
      for (const f of consumed) mark.run(sessionId, f.id);
      return messages;
    })();
  }
}

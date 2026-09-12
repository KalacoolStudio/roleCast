import React from "react";

/** Group original fragments; checkpoint IDs remain anchors without repeating text. */
export function conversationRows(call, events = []) {
  const fragments = new Map((call.captions || []).map((f) => [f.id, f]));
  const messages = new Map(call.messages.map((m) => [m.id, m]));
  for (const event of events.filter((e) => e.callId === call.id)) {
    if (event.type === "caption")
      fragments.set(event.fragment.id, event.fragment);
    if (event.type === "checkpoint")
      for (const m of event.messages) messages.set(m.id, m);
  }
  const rows = [],
    rendered = new Set();
  const attempt = (voiceId) => {
    if (rendered.has(voiceId)) return;
    rendered.add(voiceId);
    const sources = [...fragments.values()]
      .filter((f) => f.voiceId === voiceId)
      .sort((a, b) => a.sequence - b.sequence);
    for (const f of sources) {
      let row = rows.at(-1);
      if (
        !row ||
        row.voiceId !== voiceId ||
        row.speaker !== f.speaker ||
        f.late
      ) {
        row = {
          id: f.id,
          voiceId,
          speaker: f.speaker,
          fragments: [],
          anchors: [],
          text: "",
          late: f.late,
        };
        rows.push(row);
      }
      row.text += f.delta;
      row.fragments.push(f.id);
    }
    for (const m of messages.values())
      if (m.voiceId === voiceId) {
        const row = rows.find((r) =>
          r.fragments?.includes(m.fragmentSpans?.[0]?.id),
        );
        if (row) row.anchors.push(m);
      }
  };
  for (const m of [...messages.values()].sort(
    (a, b) => a.sequence - b.sequence,
  )) {
    if (m.source === "voice") attempt(m.voiceId);
    else rows.push({ ...m, anchors: [m.id] });
  }
  for (const f of fragments.values()) attempt(f.voiceId);
  return rows;
}
export function Conversation({ call, events }) {
  return conversationRows(call, events).map((row) => (
    <div
      key={row.id}
      className={`message ${row.speaker} ${row.voiceId ? "voice-message" : ""}`}
    >
      {!row.voiceId &&
        row.anchors.map((id) => (
          <span key={id} id={`message-${id}`} className="evidence-anchor" />
        ))}
      <small>{row.speaker === "user" ? "你" : call.persona.name}</small>
      <p>{row.text}</p>
      {row.voiceId && (
        <small className="caption-note">
          語音逐字片段{row.late ? " · 延遲收到" : ""}
          {row.speaker === "persona" ? " · 播放未確認" : " · 辨識可能不完整"}
        </small>
      )}
      {row.voiceId && row.anchors.length > 0 && (
        <details className="voice-evidence">
          <summary>檢視評估引用片段</summary>
          {row.anchors.map((m) => (
            <p id={`message-${m.id}`} key={m.id} className="evidence-anchor">
              {m.text}
            </p>
          ))}
        </details>
      )}
    </div>
  ));
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Conversation, conversationRows } from "./conversation.jsx";

export function HistoryReports({
  drills,
  selectedId,
  drill,
  events,
  labels,
  ends,
  formatDate,
  onSelect,
  onStartNew,
}) {
  return (
    <div className="reports-page">
      <header className="reports-heading">
        <div>
          <div className="eyebrow">REPORT ARCHIVE</div>
          <h1>歷史報告</h1>
          <p>選擇一場演練，查看完整回饋與通話證據。</p>
        </div>
        <span>{drills.length} 份紀錄</span>
      </header>
      <div className="report-browser">
        <aside className="report-index" aria-label="歷史報告列表">
          <h2>演練列表</h2>
          {drills.length ? (
            <ul>
              {drills.map((item) => (
                <li key={item.id}>
                  <button
                    className={item.id === selectedId ? "selected" : ""}
                    aria-current={item.id === selectedId ? "page" : undefined}
                    onClick={() => onSelect(item.id)}
                  >
                    <strong>{item.plot.name}</strong>
                    <span>{formatDate(item.createdAt)}</span>
                    <small>{labels[item.state]}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="report-empty">完成第一場演練後，報告會出現在這裡。</p>
          )}
        </aside>
        <section className="report-detail" aria-live="polite">
          {!selectedId ? (
            <div className="report-placeholder">
              <span aria-hidden="true">▤</span>
              <h2>選擇一份報告</h2>
              <p>左側會保留每次演練的時間、劇本和完成狀態。</p>
            </div>
          ) : !drill ? (
            <div className="loading" role="status">
              正在取得報告…
            </div>
          ) : (
            <ReportDetail
              drill={drill}
              events={events}
              labels={labels}
              ends={ends}
              formatDate={formatDate}
              onStartNew={onStartNew}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function ReportDetail({ drill, events, labels, ends, formatDate, onStartNew }) {
  const messages = drill.calls.flatMap((call) => call.messages);
  const duration = drillDuration(drill, events);
  return (
    <>
      <div className="report-title">
        <div>
          <div className="eyebrow">YOUR DRILL</div>
          <h2>{drill.plot.name}</h2>
          <p>
            {formatDate(drill.createdAt)} · 共 {drill.calls.length} 通電話 ·
            歷時 {duration}
          </p>
        </div>
        <span className="state ended">{labels[drill.state]}</span>
      </div>
      {drill.error && (
        <div className="error report-error" role="alert">
          {drill.error.message}
        </div>
      )}
      {drill.report ? (
        <Report report={drill.report} messages={messages} />
      ) : (
        <div className="report-unavailable">
          <h3>這場演練沒有產生完整報告</h3>
          <p>通話紀錄與結束狀態仍已保存，可在下方查看。</p>
        </div>
      )}
      <Timeline drill={drill} events={events} ends={ends} />
      {drill.calls.length > 0 && (
        <section className="report-transcript">
          <div className="eyebrow">CALL EVIDENCE</div>
          <h2>通話紀錄</h2>
          {drill.calls.map((call) => (
            <section className="call" key={call.id}>
              <div className="call-heading">
                <span className="avatar small">
                  {call.persona.name.slice(0, 1)}
                </span>
                <div>
                  <h2>
                    {call.persona.name} <small>第 {call.ordinal} 通</small>
                  </h2>
                  <p>{call.persona.role}</p>
                </div>
                {call.endedAt && (
                  <span className="call-end">{ends[call.endReason]}</span>
                )}
              </div>
              <div className="messages">
                <Conversation call={call} events={[]} />
              </div>
            </section>
          ))}
        </section>
      )}
      <button className="primary" onClick={onStartNew}>
        開始下一次練習 ↗
      </button>
    </>
  );
}

function Report({ report, messages }) {
  return (
    <section className="report">
      <section className="report-card report-overview">
        <div className="eyebrow">REFLECT & GROW</div>
        <h2>這次練習，你帶走了什麼？</h2>
        <p className="summary">{report.summary}</p>
        {report.insufficientEvidence && (
          <p className="evidence-note">目前證據不足，部分面向尚無法評估。</p>
        )}
      </section>
      <section className="report-card">
        <h2>能力面向</h2>
        <div className="dimensions">
          {report.dimensions.map((dimension, index) => (
            <article key={index}>
              <h3>{dimension.name}</h3>
              <p>{dimension.assessment}</p>
              <Evidence ids={dimension.evidenceIds} messages={messages} />
            </article>
          ))}
        </div>
      </section>
      <div className="feedback-grid">
        <section className="report-card">
          <Findings
            title="做得好的地方"
            items={report.strengths}
            messages={messages}
          />
        </section>
        <section className="report-card">
          <Findings
            title="下一次可以試試"
            items={report.improvements}
            messages={messages}
          />
        </section>
      </div>
      {report.uncertainties.length > 0 && (
        <section className="report-card uncertainties">
          <h3>仍需要更多練習的觀察</h3>
          <ul>
            {report.uncertainties.map((value, index) => (
              <li key={index}>{value}</li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

const eventPresentation = {
  planning_started: ["mastermind", "Mastermind 規劃下一通"],
  persona_assigned: ["mastermind", "Mastermind 完成角色指派"],
  call_started: ["system", "通話接通"],
  turn_started: ["judge", "Judge 開始觀察回應"],
  turn_completed: ["judge", "Judge 完成觀察"],
  call_ended: ["system", "通話結束"],
  recap_started: ["judge", "Judge 開始整理本通紀錄"],
  recap_completed: ["judge", "Judge 完成本通回顧"],
  report_started: ["system", "開始產出演練報告"],
  drill_completed: ["system", "演練完成"],
  drill_failed: ["system", "演練未完成"],
  drill_interrupted: ["system", "演練中斷"],
};
const actorLabels = {
  system: "系統",
  mastermind: "Mastermind",
  judge: "Judge",
  persona: "Persona",
  user: "你",
};
const timeValue = (value) => {
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
};
const elapsed = (milliseconds) => {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};
function drillDuration(drill, events) {
  const start = timeValue(drill.createdAt);
  const candidates = [
    ...events.map((event) => timeValue(event.occurredAt)),
    ...drill.calls.flatMap((call) => [
      timeValue(call.endedAt),
      ...call.messages.map((message) => timeValue(message.createdAt)),
    ]),
  ].filter((value) => value !== null);
  return start === null || candidates.length === 0
    ? "00:00"
    : elapsed(Math.max(...candidates) - start);
}
function makeTimeline(drill, stageEvents, ends) {
  const start = timeValue(drill.createdAt) ?? 0;
  const callLabels = new Map(
    drill.calls.map((call) => [
      call.id,
      `第 ${call.ordinal} 通 · ${call.persona.name}`,
    ]),
  );
  const items = [
    {
      id: "drill-started",
      at: start,
      actor: "system",
      title: "演練開始",
      body: drill.plot.goal,
      transcript: false,
    },
  ];
  for (const event of stageEvents) {
    const presentation = eventPresentation[event.type];
    const at = timeValue(event.occurredAt);
    if (!presentation || at === null) continue;
    const persona = event.persona?.name ? ` · ${event.persona.name}` : "";
    const end =
      event.type === "call_ended" ? ` · ${ends[event.endReason] || ""}` : "";
    items.push({
      id: `stage-${event.sequence}`,
      at,
      actor: presentation[0],
      title: `${presentation[1]}${persona}${end}`,
      callLabel: callLabels.get(event.callId),
      transcript: false,
    });
  }
  for (const call of drill.calls) {
    if (stageEvents.length === 0) {
      const started = timeValue(call.startedAt);
      const ended = timeValue(call.endedAt);
      if (started !== null)
        items.push({
          id: `call-${call.id}-started`,
          at: started,
          actor: "system",
          title: "通話接通",
          callLabel: callLabels.get(call.id),
          transcript: false,
        });
      if (ended !== null)
        items.push({
          id: `call-${call.id}-ended`,
          at: ended,
          actor: "system",
          title: `通話結束 · ${ends[call.endReason] || ""}`,
          callLabel: callLabels.get(call.id),
          transcript: false,
        });
    }
    for (const [index, row] of conversationRows(call).entries()) {
      const anchor = row.anchors.find((value) => typeof value === "object");
      const at = timeValue(row.createdAt || anchor?.createdAt);
      if (at === null) continue;
      items.push({
        id: `message-${call.id}-${row.id || index}`,
        at,
        actor: row.speaker,
        title:
          row.source === "atm"
            ? "ATM 操作"
            : row.speaker === "user"
              ? "你"
              : call.persona.name,
        body: row.text,
        callLabel: callLabels.get(call.id),
        transcript: true,
      });
    }
  }
  return items
    .filter((item) => Number.isFinite(item.at))
    .sort((a, b) => a.at - b.at)
    .map((item) => ({ ...item, offset: item.at - start }));
}

function Timeline({ drill, events, ends }) {
  const allItems = useMemo(
    () => makeTimeline(drill, events, ends),
    [drill, events, ends],
  );
  const [showTranscript, setShowTranscript] = useState(true);
  const items = showTranscript
    ? allItems
    : allItems.filter((item) => !item.transcript);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const currentRef = useRef(null);
  const listRef = useRef(null);
  const index = Math.min(current, Math.max(0, items.length - 1));
  const span = Math.max(1, allItems.at(-1)?.offset || 1);
  useEffect(() => {
    setCurrent((value) => Math.min(value, Math.max(0, items.length - 1)));
  }, [items.length]);
  useEffect(() => {
    const list = listRef.current;
    const item = currentRef.current;
    if (!list || !item) return;
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight;
  }, [index]);
  useEffect(() => {
    if (!playing) return;
    if (index >= items.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setCurrent(index + 1), 850);
    return () => clearTimeout(timer);
  }, [index, items.length, playing]);
  if (items.length === 0) return null;
  return (
    <section className="report-card timeline" aria-label="演練時間軸">
      <h2>演練時間軸</h2>
      <p className="timeline-intro">
        依實際發生時間排列公開的角色活動與通話內容，選取刻度即可回看。
      </p>
      <div className="timeline-track" aria-hidden="true">
        {allItems.map((item) => (
          <button
            key={item.id}
            className={`timeline-mark ${item.actor} ${items[index]?.id === item.id ? "current" : ""}`}
            style={{ left: `${(item.offset / span) * 100}%` }}
            tabIndex={-1}
            onClick={() => {
              const visibleIndex = items.findIndex(
                (value) => value.id === item.id,
              );
              if (visibleIndex >= 0) setCurrent(visibleIndex);
            }}
          />
        ))}
      </div>
      <input
        className="timeline-slider"
        type="range"
        min="0"
        max={Math.max(0, items.length - 1)}
        value={index}
        aria-label="時間軸位置"
        onChange={(event) => setCurrent(Number(event.target.value))}
      />
      <div className="timeline-controls">
        <button onClick={() => setCurrent(Math.max(0, index - 1))}>
          上一格
        </button>
        <button
          aria-pressed={playing}
          onClick={() => {
            if (index >= items.length - 1) setCurrent(0);
            setPlaying(!playing);
          }}
        >
          {playing ? "暫停" : "播放"}
        </button>
        <button
          onClick={() => setCurrent(Math.min(items.length - 1, index + 1))}
        >
          下一格
        </button>
        <span>
          {index + 1} / {items.length}
        </span>
        <label>
          <input
            type="checkbox"
            checked={showTranscript}
            onChange={(event) => setShowTranscript(event.target.checked)}
          />
          顯示逐字稿
        </label>
      </div>
      <div className="timeline-list" role="list" tabIndex="0" ref={listRef}>
        {items.map((item, itemIndex) => (
          <button
            type="button"
            role="listitem"
            ref={itemIndex === index ? currentRef : undefined}
            key={item.id}
            className={`timeline-event ${item.actor} ${itemIndex === index ? "current" : ""}`}
            onClick={() => setCurrent(itemIndex)}
          >
            <span className="timeline-time">+{elapsed(item.offset)}</span>
            <span className="timeline-event-copy">
              <strong>{item.title}</strong>
              <small>
                {actorLabels[item.actor] || item.actor}
                {item.callLabel ? ` · ${item.callLabel}` : ""}
              </small>
              {item.body && <span>{item.body}</span>}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Evidence({ ids, messages }) {
  return (
    <div className="evidence">
      {ids.map((id) => {
        const message = messages.find((value) => value.id === id);
        return message ? (
          <a
            key={id}
            href={`#message-${id}`}
            onClick={(event) => {
              event.preventDefault();
              const target = document.getElementById(`message-${id}`);
              const detail = target?.closest("details");
              if (detail) detail.open = true;
              target?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            「{message.text.slice(0, 60)}
            {message.text.length > 60 ? "…" : ""}」
          </a>
        ) : null;
      })}
    </div>
  );
}

function Findings({ title, items, messages }) {
  return (
    <div>
      <h3>{title}</h3>
      {items.length ? (
        items.map((item, index) => (
          <div className="finding" key={index}>
            <p>{item.text}</p>
            <Evidence ids={item.evidenceIds} messages={messages} />
          </div>
        ))
      ) : (
        <p className="hint">尚無足夠紀錄。</p>
      )}
    </div>
  );
}

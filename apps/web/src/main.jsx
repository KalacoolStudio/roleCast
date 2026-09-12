import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const labels = {
  planning: "正在安排對話",
  awaiting_call: "下一通已準備好",
  in_call: "通話進行中",
  recapping: "正在整理本通紀錄",
  reporting: "正在撰寫回饋",
  completed: "演練完成",
  failed: "演練未完成",
  interrupted: "演練已中斷",
};
const ends = {
  user: "你已掛斷",
  persona: "對方已結束通話",
  judge: "本通演練已結束",
  turn_limit: "已達本通回合上限",
  user_finish: "你已結束演練",
  failed: "處理失敗",
  interrupted: "服務已中斷",
};
const finished = (s) => ["completed", "failed", "interrupted"].includes(s);
async function api(path, body) {
  const response = await fetch(
    `/api${path}`,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(data.message || "連線失敗，請稍後重試。"),
      data,
    );
  return data;
}
const date = (value) =>
  new Date(value).toLocaleString("zh-TW", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
function App() {
  const [scenarios, setScenarios] = useState([]),
    [sessions, setSessions] = useState([]);
  const [id, setId] = useState(location.hash.slice(1)),
    [session, setSession] = useState(null);
  const [scenarioId, setScenarioId] = useState("anti-fraud"),
    [background, setBackground] = useState("");
  const [text, setText] = useState(""),
    [error, setError] = useState(""),
    [acting, setActing] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const selected = useRef(id),
    bottom = useRef(null);
  const select = useCallback((next) => {
    selected.current = next;
    setId(next);
    location.hash = next;
    setSession(null);
    setText("");
    setError("");
    setShowHistory(false);
  }, []);
  const loadList = useCallback(async () => {
    const list = await api("/sessions");
    setSessions(list.sessions);
    setActiveId(list.activeId);
    return list;
  }, []);
  const refresh = useCallback(async (target) => {
    const value = await api(`/sessions/${target}`);
    if (selected.current === target) {
      setSession(value);
      setError("");
    }
    return value;
  }, []);
  useEffect(() => {
    let cancelled = false;
    Promise.all([api("/scenarios"), loadList()])
      .then(([available, list]) => {
        if (cancelled) return;
        setScenarios(available);
        if (!selected.current && list.activeId) select(list.activeId);
      })
      .catch(() => {
        if (!cancelled) setError("無法連線至服務，請確認後端已啟動。");
      });
    return () => {
      cancelled = true;
    };
  }, [loadList, select]);
  useEffect(() => {
    if (!id) return;
    let cancelled = false,
      timer;
    const poll = async () => {
      try {
        const s = await refresh(id);
        if (cancelled) return;
        await loadList();
        if (!finished(s.state))
          timer = setTimeout(poll, document.hidden ? 2500 : 500);
      } catch (e) {
        if (!cancelled) {
          setError(e.message || "連線中斷，正在重新連線。");
          timer = setTimeout(poll, 2500);
        }
      }
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, refresh, loadList]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [session?.calls.at(-1)?.messages.length]);
  const action = async (fn) => {
    setActing(true);
    setError("");
    try {
      await fn();
      await loadList();
    } catch (e) {
      setError(e.message || "連線失敗，請重新取得狀態。");
      if (e.activeId) setActiveId(e.activeId);
    } finally {
      setActing(false);
    }
  };
  const start = () =>
    action(async () => {
      const { id: newId } = await api("/sessions", { scenarioId, background });
      select(newId);
    });
  const command = (path, body = {}) =>
    action(async () => {
      await api(`/sessions/${id}${path}`, body);
      await refresh(id);
    });
  const call = session?.calls.find((c) => c.id === session.currentCallId);
  const send = (event) => {
    event.preventDefault();
    if (!text.trim() || !call) return;
    action(async () => {
      const key = "role-cast-pending";
      let pending;
      try {
        pending = JSON.parse(sessionStorage.getItem(key));
      } catch {
        /* no pending message */
      }
      if (
        !pending ||
        pending.sessionId !== id ||
        pending.callId !== call.id ||
        pending.text !== text
      )
        pending = {
          sessionId: id,
          callId: call.id,
          text,
          clientMessageId: crypto.randomUUID(),
        };
      sessionStorage.setItem(key, JSON.stringify(pending));
      await api(`/sessions/${id}/calls/${call.id}/messages`, {
        text: pending.text,
        clientMessageId: pending.clientMessageId,
      });
      sessionStorage.removeItem(key);
      setText("");
      await refresh(id);
    });
  };
  const retry = () =>
    action(async () => {
      setScenarios(await api("/scenarios"));
      await loadList();
      if (id) await refresh(id);
    });
  const messages = session?.calls.flatMap((c) => c.messages) || [];
  return (
    <div className="shell">
      <aside className={`sidebar ${showHistory ? "history-open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            select("");
          }}
        >
          <span className="brand-mark">
            R<span>·</span>
          </span>
          <span>
            ROLE CAST<small>對話演練室</small>
          </span>
        </a>
        <button
          className={`nav-item ${!id ? "selected" : ""}`}
          onClick={() => select("")}
        >
          <span>＋</span> 開始新演練
        </button>
        {activeId && (
          <button className="nav-item" onClick={() => select(activeId)}>
            <span className="live-dot" /> 繼續目前演練
          </button>
        )}
        <button
          className="mobile-history"
          aria-expanded={showHistory}
          onClick={() => setShowHistory(!showHistory)}
        >
          演練紀錄 {showHistory ? "−" : "＋"}
        </button>
        <div className="section-label">
          演練紀錄 <span>{sessions.length.toString().padStart(2, "0")}</span>
        </div>
        <div className="history">
          {sessions.length ? (
            sessions.map((s) => (
              <button
                key={s.id}
                className={`history-item ${s.id === id ? "current" : ""}`}
                onClick={() => select(s.id)}
              >
                <strong>{s.scenario.name}</strong>
                <span>{date(s.createdAt)}</span>
                <small>{labels[s.state]}</small>
              </button>
            ))
          ) : (
            <p className="empty-history">
              每一次練習，
              <br />
              都會留下一點進步。
            </p>
          )}
        </div>
        <div className="sidebar-foot">
          <span className="live-dot" /> 本機工作空間<small>文字版 · 0.1</small>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            WORKSPACE <span className="slash">/</span>{" "}
            {session ? "演練現場" : "情境練習"}
          </span>
          <span className="badge">TEXT EDITION</span>
        </header>
        {error && (
          <div className="error" role="alert">
            <span>{error}</span>
            <button onClick={retry} disabled={acting}>
              重新取得狀態
            </button>
          </div>
        )}
        {!id ? (
          <div className="home">
            <div className="eyebrow">
              <span /> PRACTICE MAKES PROGRESS
            </div>
            <h1>
              把重要的對話，
              <br />
              <em>先練習一次。</em>
            </h1>
            <p className="intro">
              走進情境，與不同角色對話。
              <br />
              在安全的練習空間裡，找到自己的節奏。
            </p>
            <div className="scenario-heading">
              <h2>選擇今天的練習</h2>
              <span>01 — SELECT A SCENARIO</span>
            </div>
            <div className="scenario-grid">
              {scenarios.map((s, index) => (
                <button
                  className={`scenario-card ${scenarioId === s.id ? "chosen" : ""}`}
                  key={s.id}
                  onClick={() => setScenarioId(s.id)}
                  aria-pressed={scenarioId === s.id}
                >
                  <div className="card-top">
                    <span className="card-icon">{index === 0 ? "◎" : "↗"}</span>
                    <span className="category">{s.category}</span>
                    <span className="radio" />
                  </div>
                  <h3>{s.name}</h3>
                  <p>{s.description}</p>
                  <div className="card-bottom">
                    <span>{s.duration}</span>
                    <span>文字互動</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="setup">
              <div>
                <label htmlFor="background">
                  讓練習更貼近你 <span>選填</span>
                </label>
                <p>簡單說說你的經驗，或這次想加強的地方。</p>
              </div>
              <textarea
                id="background"
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                placeholder="例如：第一次準備後端工程師面試，想練習架構取捨…"
                maxLength={2000}
              />
            </div>
            <div className="start-row">
              <p className="privacy">
                紀錄保存在本機。演練內容會送至你設定的外部 LLM API 進行推論。
              </p>
              <button
                className="primary"
                onClick={start}
                disabled={acting || !scenarios.length || !!activeId}
              >
                {acting ? "正在開始…" : "開始演練"} <span>↗</span>
              </button>
            </div>
            {activeId && (
              <p className="hint">
                目前已有進行中的演練，請從左側繼續或先結束該場。
              </p>
            )}
            <div className="how">
              <span>你的練習路徑</span>
              <p>
                <b>01</b> 進入情境
              </p>
              <i>→</i>
              <p>
                <b>02</b> 展開對話
              </p>
              <i>→</i>
              <p>
                <b>03</b> 回看與成長
              </p>
            </div>
          </div>
        ) : !session ? (
          <div className="loading" role="status">
            正在取得演練紀錄…
          </div>
        ) : (
          <div className="exercise">
            <div className="exercise-title">
              <div>
                <div className="eyebrow">YOUR PRACTICE SESSION</div>
                <h1>{session.scenario.name}</h1>
                <p>{date(session.createdAt)}</p>
              </div>
              <span
                className={`state ${finished(session.state) ? "ended" : ""}`}
                role="status"
              >
                {session.busy ? "正在回覆…" : labels[session.state]}
              </span>
            </div>
            {session.error && (
              <div className="error" role="alert">
                {session.error.message}
              </div>
            )}
            {session.pendingCall && (
              <section className="incoming">
                <span className="avatar">
                  {session.pendingCall.persona.name.slice(0, 1)}
                </span>
                <div>
                  <small>下一通對話</small>
                  <h2>{session.pendingCall.persona.name}</h2>
                  <p>{session.pendingCall.persona.role}</p>
                </div>
                <button
                  className="primary"
                  disabled={acting}
                  onClick={() =>
                    command("/calls/accept", {
                      assignmentId: session.pendingCall.assignmentId,
                    })
                  }
                >
                  接通對話 ↗
                </button>
              </section>
            )}
            <div className="transcript">
              {!session.calls.length && !session.pendingCall && (
                <div className="waiting">
                  {finished(session.state)
                    ? "這場演練尚無對話紀錄。"
                    : "正在為你準備第一通對話…"}
                </div>
              )}
              {session.calls.map((c) => (
                <section className="call" key={c.id}>
                  <div className="call-heading">
                    <span className="avatar small">
                      {c.persona.name.slice(0, 1)}
                    </span>
                    <div>
                      <h2>
                        {c.persona.name} <small>第 {c.ordinal} 通</small>
                      </h2>
                      <p>{c.persona.role}</p>
                    </div>
                    {c.endedAt && (
                      <span className="call-end">{ends[c.endReason]}</span>
                    )}
                  </div>
                  <div className="messages">
                    {c.messages.map((m) => (
                      <div
                        id={`message-${m.id}`}
                        key={m.id}
                        className={`message ${m.speaker}`}
                      >
                        <small>
                          {m.speaker === "user" ? "你" : c.persona.name}
                        </small>
                        <p>{m.text}</p>
                      </div>
                    ))}
                    {!c.endedAt && session.busy && (
                      <div className="typing" aria-label="正在處理回合">
                        <span />
                        <span />
                        <span />
                      </div>
                    )}
                  </div>
                </section>
              ))}
              <div ref={bottom} />
            </div>
            {session.state === "in_call" && (
              <form className="composer" onSubmit={send}>
                <label className="sr-only" htmlFor="message">
                  你的回覆
                </label>
                <textarea
                  id="message"
                  placeholder="寫下你的回覆…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={acting || session.busy}
                  maxLength={4000}
                />
                <button
                  className="primary"
                  type="submit"
                  disabled={acting || session.busy || !text.trim()}
                >
                  送出 ↑
                </button>
              </form>
            )}
            {!finished(session.state) && (
              <div className="call-controls">
                {session.state === "in_call" && (
                  <button
                    onClick={() => command(`/calls/${call.id}/hangup`)}
                    disabled={acting}
                  >
                    掛斷本通
                  </button>
                )}
                <button
                  disabled={
                    acting ||
                    session.finishRequested ||
                    session.state === "reporting"
                  }
                  onClick={() => command("/finish")}
                >
                  結束整場演練
                </button>
                <small>結束後會整理已完成的對話與回饋。</small>
              </div>
            )}
            {session.report && (
              <section className="report">
                <div className="eyebrow">REFLECT & GROW</div>
                <h2>這次練習，你帶走了什麼？</h2>
                <p className="summary">{session.report.summary}</p>
                {session.report.insufficientEvidence && (
                  <p className="evidence-note">
                    目前證據不足，部分面向尚無法評估。
                  </p>
                )}
                <div className="dimensions">
                  {session.report.dimensions.map((d, i) => (
                    <article key={i}>
                      <h3>{d.name}</h3>
                      <p>{d.assessment}</p>
                      <Evidence ids={d.evidenceIds} messages={messages} />
                    </article>
                  ))}
                </div>
                <div className="feedback-grid">
                  <Findings
                    title="做得好的地方"
                    items={session.report.strengths}
                    messages={messages}
                  />
                  <Findings
                    title="下一次可以試試"
                    items={session.report.improvements}
                    messages={messages}
                  />
                </div>
                {session.report.uncertainties.length > 0 && (
                  <div className="uncertainties">
                    <h3>仍需要更多練習的觀察</h3>
                    <ul>
                      {session.report.uncertainties.map((v, i) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button className="primary" onClick={() => select("")}>
                  開始下一次練習 ↗
                </button>
              </section>
            )}
          </div>
        )}
        <footer>
          ROLE CAST <span>每一次對話，都是一次練習。</span>
        </footer>
      </main>
    </div>
  );
}
function Evidence({ ids, messages }) {
  return (
    <div className="evidence">
      {ids.map((id) => {
        const m = messages.find((v) => v.id === id);
        return m ? (
          <a
            key={id}
            href={`#message-${id}`}
            onClick={(event) => {
              event.preventDefault();
              document
                .getElementById(`message-${id}`)
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            「{m.text.slice(0, 60)}
            {m.text.length > 60 ? "…" : ""}」
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
        items.map((v, i) => (
          <div className="finding" key={i}>
            <p>{v.text}</p>
            <Evidence ids={v.evidenceIds} messages={messages} />
          </div>
        ))
      ) : (
        <p className="hint">尚無足夠紀錄。</p>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

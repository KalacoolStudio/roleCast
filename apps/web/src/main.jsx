import { DrillStage } from "./stage/DrillStage.jsx";
import { connectDrill } from "./stage/feed.js";
import { PlotEditor } from "./PlotEditor.jsx";
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
async function api(path, body, method = "POST") {
  const response = await fetch(
    `/api${path}`,
    body === undefined
      ? {}
      : {
          method,
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
  const [plots, setPlots] = useState([]),
    [drills, setDrills] = useState([]);
  const [id, setId] = useState(location.hash.slice(1)),
    [drill, setDrill] = useState(null);
  const [plotId, setPlotId] = useState("anti-fraud"),
    [background, setBackground] = useState("");
  const [text, setText] = useState(""),
    [error, setError] = useState(""),
    [acting, setActing] = useState(false);
  const [stageEvents, setStageEvents] = useState([]);
  const [stageReset, setStageReset] = useState(0);
  const [connection, setConnection] = useState("connecting");
  const feed = useRef(null);
  const [activeId, setActiveId] = useState(null);
  const [managing, setManaging] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [deploymentMode, setDeploymentMode] = useState(null);
  const selected = useRef(id),
    bottom = useRef(null);
  const select = useCallback((next) => {
    setManaging(false);
    selected.current = next;
    setId(next);
    location.hash = next;
    setDrill(null);
    setText("");
    setError("");
    setShowHistory(false);
  }, []);
  const loadList = useCallback(async () => {
    const list = await api("/drills");
    setDrills(list.drills);
    setActiveId(list.activeId);
    return list;
  }, []);
  const refresh = useCallback(async (target) => {
    const value = await api(`/drills/${target}`);
    if (selected.current === target) {
      feed.current?.acceptSnapshot(value);
      setError("");
    }
    return value;
  }, []);
  useEffect(() => {
    let cancelled = false;
    Promise.all([api("/plots"), loadList(), api("/runtime")])
      .then(([available, list, runtime]) => {
        if (cancelled) return;
        setDeploymentMode(runtime.deploymentMode);
        setPlots(available);
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
    const connection = connectDrill({
      id,
      getSnapshot: () => api(`/drills/${id}`),
      getEvents: (after) => api(`/drills/${id}/events?after=${after}`),
      onSnapshot: (snapshot) => {
        if (selected.current !== id) return;
        setDrill(snapshot);
        setError("");
        loadList().catch(() => {});
      },
      onEvent: (event) => {
        if (selected.current === id)
          setStageEvents((events) => [...events, event].slice(-100));
      },
      onReset: () => {
        setStageEvents([]);
        setStageReset((n) => n + 1);
      },
      onStatus: (status) => {
        setConnection(status);
        if (status === "offline") setError("連線中斷，正在重新連線。");
      },
    });
    feed.current = connection;
    return () => {
      connection.close();
      if (feed.current === connection) feed.current = null;
    };
  }, [id, loadList]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [drill?.calls.at(-1)?.messages.length]);
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
      const { id: newId } = await api("/drills", { plotId, background });
      select(newId);
    });
  const command = (path, body = {}) =>
    action(async () => {
      await api(`/drills/${id}${path}`, body);
      await refresh(id);
    });
  const call = drill?.calls.find((c) => c.id === drill.currentCallId);
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
        (pending.drillId ?? pending.sessionId) !== id ||
        pending.callId !== call.id ||
        pending.text !== text
      )
        pending = {
          drillId: id,
          callId: call.id,
          text,
          clientMessageId: crypto.randomUUID(),
        };
      sessionStorage.setItem(key, JSON.stringify(pending));
      await api(`/drills/${id}/calls/${call.id}/messages`, {
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
      setDeploymentMode((await api("/runtime")).deploymentMode);
      setPlots(await api("/plots"));
      await loadList();
      if (id) await refresh(id);
    });
  const messages = drill?.calls.flatMap((c) => c.messages) || [];
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
          className={`nav-item ${!id && !managing ? "selected" : ""}`}
          onClick={() => select("")}
        >
          <span>＋</span> 開始新演練
        </button>
        <button
          className={`nav-item ${managing ? "selected" : ""}`}
          onClick={() => setManaging(true)}
        >
          劇本工作室
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
          演練紀錄 <span>{drills.length.toString().padStart(2, "0")}</span>
        </div>
        <div className="history">
          {drills.length ? (
            drills.map((s) => (
              <button
                key={s.id}
                className={`history-item ${s.id === id ? "current" : ""}`}
                onClick={() => select(s.id)}
              >
                <strong>{s.plot.name}</strong>
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
          <span className="live-dot" />
          {deploymentMode === "gcp"
            ? "雲端共用工作空間"
            : deploymentMode === "local"
              ? "本機工作空間"
              : "正在連線…"}
          <small>文字版 · 0.1</small>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            WORKSPACE <span className="slash">/</span>{" "}
            {managing
              ? "劇本工作室"
              : drill
                ? "演練現場 · DRILL"
                : "劇本練習 · PLOT"}
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
        {managing ? (
          <PlotEditor
            plots={plots}
            api={api}
            onSaved={async (plot) => {
              setPlots(await api("/plots"));
              setPlotId(plot.id);
            }}
            onUse={(plotId) => {
              select("");
              setPlotId(plotId);
            }}
          />
        ) : !id ? (
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
            <div className="plot-heading">
              <h2>選擇今天的練習</h2>
              <span>01 — SELECT A PLOT</span>
            </div>
            <p className="hint">
              每個 plot 是一份劇本；每次開始會建立新的 drill。
            </p>
            <div className="plot-grid">
              {plots.map((s, index) => (
                <button
                  className={`plot-card ${plotId === s.id ? "chosen" : ""}`}
                  key={s.id}
                  onClick={() => setPlotId(s.id)}
                  aria-pressed={plotId === s.id}
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
                {deploymentMode === "gcp"
                  ? "紀錄保存在 GCP，並與此工作空間的授權使用者共用。"
                  : deploymentMode === "local"
                    ? "紀錄保存在本機。"
                    : "正在確認紀錄儲存位置。"}
                演練內容會送至你設定的外部 LLM API 進行推論。
              </p>
              <button
                className="primary"
                onClick={start}
                disabled={
                  acting || !plots.length || !deploymentMode || !!activeId
                }
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
        ) : !drill ? (
          <div className="loading" role="status">
            正在取得演練紀錄…
          </div>
        ) : (
          <div className="exercise">
            <div className="exercise-title">
              <div>
                <div className="eyebrow">YOUR DRILL</div>
                <h1>{drill.plot.name}</h1>
                <p>
                  {date(drill.createdAt)} · Plot v{drill.plot.version}
                </p>
              </div>
              <span
                className={`state ${finished(drill.state) ? "ended" : ""}`}
                role="status"
              >
                {drill.busy ? "正在回覆…" : labels[drill.state]}
              </span>
            </div>
            {drill.error && (
              <div className="error" role="alert">
                {drill.error.message}
              </div>
            )}
            <div className="drill-workspace">
              <DrillStage
                key={drill.id}
                drill={drill}
                events={stageEvents}
                resetKey={stageReset}
                connection={connection}
              />
              <div className="drill-conversation">
                {drill.pendingCall && (
                  <section className="incoming">
                    <span className="avatar">
                      {drill.pendingCall.persona.name.slice(0, 1)}
                    </span>
                    <div>
                      <small>下一通對話</small>
                      <h2>{drill.pendingCall.persona.name}</h2>
                      <p>{drill.pendingCall.persona.role}</p>
                    </div>
                    <button
                      className="primary"
                      disabled={acting}
                      onClick={() =>
                        command("/calls/accept", {
                          assignmentId: drill.pendingCall.assignmentId,
                        })
                      }
                    >
                      接通對話 ↗
                    </button>
                  </section>
                )}
                <div className="transcript">
                  {!drill.calls.length && !drill.pendingCall && (
                    <div className="waiting">
                      {finished(drill.state)
                        ? "這場演練尚無對話紀錄。"
                        : "正在為你準備第一通對話…"}
                    </div>
                  )}
                  {drill.calls.map((c) => (
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
                        {!c.endedAt && drill.busy && (
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
                {drill.state === "in_call" && (
                  <form className="composer" onSubmit={send}>
                    <label className="sr-only" htmlFor="message">
                      你的回覆
                    </label>
                    <textarea
                      id="message"
                      placeholder="寫下你的回覆…"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      disabled={acting || drill.busy}
                      maxLength={4000}
                    />
                    <button
                      className="primary"
                      type="submit"
                      disabled={acting || drill.busy || !text.trim()}
                    >
                      送出 ↑
                    </button>
                  </form>
                )}
                {!finished(drill.state) && (
                  <div className="call-controls">
                    {drill.state === "in_call" && (
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
                        drill.finishRequested ||
                        drill.state === "reporting"
                      }
                      onClick={() => command("/finish")}
                    >
                      結束整場演練
                    </button>
                    <small>結束後會整理已完成的對話與回饋。</small>
                  </div>
                )}
              </div>
            </div>
            {drill.report && (
              <section className="report">
                <div className="eyebrow">REFLECT & GROW</div>
                <h2>這次練習，你帶走了什麼？</h2>
                <p className="summary">{drill.report.summary}</p>
                {drill.report.insufficientEvidence && (
                  <p className="evidence-note">
                    目前證據不足，部分面向尚無法評估。
                  </p>
                )}
                <div className="dimensions">
                  {drill.report.dimensions.map((d, i) => (
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
                    items={drill.report.strengths}
                    messages={messages}
                  />
                  <Findings
                    title="下一次可以試試"
                    items={drill.report.improvements}
                    messages={messages}
                  />
                </div>
                {drill.report.uncertainties.length > 0 && (
                  <div className="uncertainties">
                    <h3>仍需要更多練習的觀察</h3>
                    <ul>
                      {drill.report.uncertainties.map((v, i) => (
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

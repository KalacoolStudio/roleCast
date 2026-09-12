import { DrillStage } from "./stage/DrillStage.jsx";
import { connectDrill } from "./stage/feed.js";
import { PlotEditor } from "./PlotEditor.jsx";
import { Home, CastMark } from "./Home.jsx";
import { MarketplaceIntro } from "./MarketplaceIntro.jsx";
import { IncomingCall } from "./IncomingCall.jsx";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import "./home.css";
import { useVoice } from "./use-voice.js";
import { Conversation } from "./conversation.jsx";
import { AtmDrawer } from "./AtmDrawer.jsx";
import { useIncomingCallTone } from "./incoming-call.js";
import { HistoryReports } from "./HistoryReports.jsx";

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
  voice_duration_limit: "已達本通語音時間上限",
  user_finish: "你已結束演練",
  failed: "處理失敗",
  interrupted: "服務已中斷",
};
const finished = (s) => ["completed", "failed", "interrupted"].includes(s);
async function api(path, body, method = "POST", signal) {
  const response = await fetch(
    `/api${path}`,
    body === undefined
      ? {}
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal,
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
const voiceApi = (path, body, signal) => api(path, body, "POST", signal);
const date = (value) =>
  new Date(value).toLocaleString("zh-TW", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const initialRoute = () => {
  const hash = location.hash.slice(1);
  if (hash === "reports") return { reports: true, id: "" };
  if (hash.startsWith("reports/"))
    return { reports: true, id: decodeURIComponent(hash.slice(8)) };
  return { reports: false, id: hash };
};
function App() {
  const initial = useRef(initialRoute()).current;
  const [plots, setPlots] = useState([]),
    [drills, setDrills] = useState([]);
  const [id, setId] = useState(initial.id),
    [drill, setDrill] = useState(null);
  const [plotId, setPlotId] = useState("anti-fraud");
  const [error, setError] = useState(""),
    [acting, setActing] = useState(false);
  const [stageEvents, setStageEvents] = useState([]);
  const [reportEvents, setReportEvents] = useState([]);
  const [stageReset, setStageReset] = useState(0);
  const [connection, setConnection] = useState("connecting");
  const feed = useRef(null);
  const [activeId, setActiveId] = useState(null);
  const [managing, setManaging] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [showReports, setShowReports] = useState(initial.reports);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [deploymentMode, setDeploymentMode] = useState(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [dismissedCallId, setDismissedCallId] = useState(null);
  const incomingTrigger = useRef(null);
  const voice = useVoice(id, drill, voiceApi);
  useIncomingCallTone(
    !showReports &&
      !managing &&
      !showIntro &&
      drill?.pendingCall &&
      voice.available &&
      !voice.active
      ? `${drill.id}:${drill.pendingCall.assignmentId}`
      : null,
  );
  const following = useRef(true);
  const [follow, setFollow] = useState(true);
  const selected = useRef(id),
    reportsView = useRef(initial.reports),
    transcript = useRef(null);
  const select = useCallback((next) => {
    following.current = true;
    setFollow(true);
    setManaging(false);
    setShowIntro(false);
    setShowReports(false);
    reportsView.current = false;
    if (selected.current !== next) setDrill(null);
    selected.current = next;
    setId(next);
    location.hash = next;
    setError("");
    setDismissedCallId(null);
  }, []);
  const openReports = (next = "") => {
    const sameDrill = selected.current === next;
    voice.stop();
    following.current = true;
    setFollow(true);
    setManaging(false);
    setShowIntro(false);
    setShowReports(true);
    reportsView.current = true;
    selected.current = next;
    setId(next);
    if (!sameDrill) setDrill(null);
    setError("");
    location.hash = next ? `reports/${encodeURIComponent(next)}` : "reports";
  };
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
    api("/workspace")
      .then(() => {
        if (!cancelled) setWorkspaceReady(true);
        return Promise.all([api("/plots"), loadList(), api("/runtime")]);
      })
      .then(([available, list, runtime]) => {
        if (cancelled) return;
        setDeploymentMode(runtime.deploymentMode);
        setPlots(available);
        if (!selected.current && !reportsView.current && list.activeId)
          select(list.activeId);
      })
      .catch(() => {
        if (!cancelled) setError("無法連線至服務，請確認後端已啟動。");
      });
    return () => {
      cancelled = true;
    };
  }, [loadList, select]);
  useEffect(() => {
    if (!id || !workspaceReady) return;
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
  }, [id, loadList, workspaceReady]);
  useEffect(() => {
    if (!drill || !finished(drill.state) || reportsView.current) return;
    voice.stop();
    reportsView.current = true;
    setShowReports(true);
    location.hash = `reports/${encodeURIComponent(drill.id)}`;
  }, [drill?.id, drill?.state]);
  useEffect(() => {
    let cancelled = false;
    setReportEvents([]);
    if (!showReports || !id || !workspaceReady) return;
    (async () => {
      let after = 0;
      const events = [];
      do {
        const page = await api(`/drills/${id}/events?after=${after}`);
        events.push(...page.events);
        after = page.nextCursor;
        if (!page.hasMore) break;
      } while (!cancelled);
      if (!cancelled && selected.current === id) setReportEvents(events);
    })().catch(() => {
      if (!cancelled) setReportEvents([]);
    });
    return () => {
      cancelled = true;
    };
  }, [id, showReports, workspaceReady]);
  useEffect(() => {
    if (showReports) window.scrollTo({ top: 0 });
  }, [id, showReports]);
  useEffect(() => {
    if (following.current && drill?.state === "in_call")
      transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [drill?.calls.at(-1)?.messages.length, voice.events.length, drill?.state]);
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
      const { id: newId } = await api("/drills", { plotId });
      select(newId);
    });
  const command = (path, body = {}) =>
    action(async () => {
      if (path.endsWith("/hangup") || path === "/finish") voice.stop();
      await api(`/drills/${id}${path}`, body);
      await refresh(id);
    });
  const call = drill?.calls.find((c) => c.id === drill.currentCallId);
  const voiceMode = voice.active || call?.inputMode === "voice";
  const startVoice = () =>
    voice.start(async () => {
      if (drill.pendingCall) {
        const accepted = await api(`/drills/${id}/calls/accept`, {
          assignmentId: drill.pendingCall.assignmentId,
          mode: "voice",
        });
        await refresh(id);
        return accepted.callId;
      }
      return call.id;
    });
  const atmAction = async (payload) => {
    const result = await api(`/drills/${id}/calls/${call.id}/atm`, payload);
    await refresh(id);
    return result;
  };
  const retry = () =>
    action(async () => {
      await api("/workspace");
      setWorkspaceReady(true);
      setDeploymentMode((await api("/runtime")).deploymentMode);
      setPlots(await api("/plots"));
      await loadList();
      if (id) await refresh(id);
    });
  return (
    <div className="shell">
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-header">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              select("");
            }}
          >
            <CastMark />
            <span>
              RoleCast<small>劇本大廳</small>
            </span>
          </a>
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={sidebarCollapsed ? "展開側邊欄" : "收合側邊欄"}
            title={sidebarCollapsed ? "展開側邊欄" : "收合側邊欄"}
            aria-expanded={!sidebarCollapsed}
            aria-controls="sidebar-content"
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="M9 4v16" />
              <path d={sidebarCollapsed ? "m13 9 3 3-3 3" : "m16 9-3 3 3 3"} />
            </svg>
          </button>
        </div>
        <div
          id="sidebar-content"
          className="sidebar-content"
          hidden={sidebarCollapsed}
        >
          <button
            className={`nav-item ${!id && !managing && !showIntro && !showReports ? "selected" : ""}`}
            onClick={() => select("")}
          >
            <span>＋</span> 開始新演練
          </button>
          <button
            className={`nav-item ${managing ? "selected" : ""}`}
            onClick={() => {
              voice.stop();
              setShowIntro(false);
              setShowReports(false);
              reportsView.current = false;
              setManaging(true);
            }}
          >
            劇本工作室
          </button>
          <button
            className={`nav-item ${showReports ? "selected" : ""}`}
            onClick={() => openReports("")}
          >
            <span aria-hidden="true">▤</span> 歷史報告
            <small className="nav-count">{drills.length}</small>
          </button>
          {activeId && (
            <button className="nav-item" onClick={() => select(activeId)}>
              <span className="live-dot" /> 繼續目前演練
            </button>
          )}
          <div className="sidebar-foot">
            <span className="live-dot" />
            {deploymentMode === "gcp"
              ? "雲端私人工作區"
              : deploymentMode === "local"
                ? "本機工作空間"
                : "正在連線…"}
            <small>對話演練 · 0.1</small>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            WORKSPACE <span className="slash">/</span>{" "}
            {managing
              ? "劇本工作室"
              : showReports
                ? "歷史報告 · REPORTS"
                : showIntro
                  ? "情境示範 · CHAT"
                  : drill
                    ? "演練現場 · DRILL"
                    : "劇本練習 · PLOT"}
          </span>
          <span className="topbar-note">Adaptive role orchestration</span>
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
        ) : showIntro ? (
          <MarketplaceIntro
            onContinue={start}
            onBack={() => select("")}
            acting={acting}
            activeId={activeId}
            onResume={select}
          />
        ) : showReports ? (
          <HistoryReports
            drills={drills}
            selectedId={id}
            drill={drill}
            events={reportEvents}
            labels={labels}
            ends={ends}
            formatDate={date}
            onSelect={openReports}
            onStartNew={() => select("")}
          />
        ) : !id ? (
          <Home
            plots={plots}
            plotId={plotId}
            onSelect={setPlotId}
            onStart={() =>
              plotId === "anti-fraud" ? setShowIntro(true) : start()
            }
            acting={acting}
            activeId={activeId}
            onResume={select}
            deploymentMode={deploymentMode}
            voiceAvailability={voice.availability}
          />
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
              {drill.pendingCall ? (
                <button
                  ref={incomingTrigger}
                  type="button"
                  className="state incoming-call-trigger"
                  aria-haspopup="dialog"
                  aria-controls="incoming-call-dialog"
                  onClick={() => setDismissedCallId(null)}
                >
                  來電中 · 查看來電
                </button>
              ) : (
                <span
                  className={`state ${finished(drill.state) ? "ended" : ""}`}
                  role="status"
                >
                  {drill.busy ? "正在回覆…" : labels[drill.state]}
                </span>
              )}
            </div>
            {drill.error && (
              <div className="error" role="alert">
                {drill.error.message}
              </div>
            )}
            {voice.error && (
              <div className="error" role="alert">
                {voice.error}
              </div>
            )}
            {drill.pendingCall && (
              <IncomingCall
                key={drill.pendingCall.assignmentId}
                open={dismissedCallId !== drill.pendingCall.assignmentId}
                onDismiss={() =>
                  setDismissedCallId(drill.pendingCall.assignmentId)
                }
                returnFocusRef={incomingTrigger}
                error={error || drill.error?.message || voice.error}
                persona={drill.pendingCall.persona}
                plotId={drill.plot.id}
                acting={acting}
                finishRequested={drill.finishRequested}
                voice={voice}
                onAnswer={startVoice}
                onDecline={() => command("/finish")}
              >
                <VoiceDisclosure
                  drill={drill}
                  deploymentMode={deploymentMode}
                />
              </IncomingCall>
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
                <div
                  className="transcript"
                  ref={transcript}
                  onScroll={(event) => {
                    const node = event.currentTarget;
                    following.current =
                      node.scrollHeight - node.clientHeight - node.scrollTop <
                      80;
                    setFollow(following.current);
                  }}
                >
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
                        <Conversation
                          call={c}
                          events={voice.events.filter(
                            (e) => e.sessionId === id,
                          )}
                        />
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
                </div>
                {!follow && drill.state === "in_call" && (
                  <button
                    className="follow-conversation"
                    onClick={() => {
                      following.current = true;
                      setFollow(true);
                      transcript.current?.scrollTo({
                        top: transcript.current.scrollHeight,
                        behavior: "smooth",
                      });
                    }}
                  >
                    回到最新對話 ↓
                  </button>
                )}
                {drill.state === "in_call" && (
                  <div className="voice-panel">
                    <div role="status">
                      {voice.state === "preparing"
                        ? "正在準備麥克風…"
                        : voice.state === "connecting"
                          ? "正在連接語音…"
                          : voice.state === "active"
                            ? voice.muted
                              ? "麥克風已靜音"
                              : "語音已連線，直接說話即可"
                            : call?.inputMode === "voice"
                              ? "語音正在結束，請稍候…"
                              : voice.available
                                ? "重新開啟語音後即可繼續通話。"
                                : "語音尚未設定，請重新啟動服務。"}
                    </div>
                    {voice.state === "active" && (
                      <span className="voice-playback">
                        {voice.playing ? "對方正在說話" : "等候對方說話"}
                        {voice.mutePending ? " · 正在切換麥克風…" : ""}
                      </span>
                    )}
                    {voice.active ? (
                      <div className="voice-buttons">
                        <button
                          disabled={
                            voice.state !== "active" || voice.mutePending
                          }
                          onClick={voice.mute}
                        >
                          {voice.muted ? "取消靜音" : "麥克風靜音"}
                        </button>
                      </div>
                    ) : (
                      drill.state === "in_call" && (
                        <button
                          className="voice-start"
                          disabled={
                            acting ||
                            drill.busy ||
                            voiceMode ||
                            !voice.available
                          }
                          onClick={startVoice}
                        >
                          {voice.error?.startsWith("音訊播放")
                            ? "啟用聲音"
                            : voice.error
                              ? "重新開啟語音"
                              : "開啟語音"}
                        </button>
                      )
                    )}
                    <VoiceDisclosure
                      drill={drill}
                      deploymentMode={deploymentMode}
                    />
                  </div>
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
            <AtmDrawer
              drill={drill}
              call={call}
              enabled={voice.state === "active"}
              onAction={atmAction}
            />
          </div>
        )}
        <footer>
          RoleCast <span>每一次對話，都是一次練習。</span>
        </footer>
      </main>
    </div>
  );
}
function VoiceDisclosure({ drill, deploymentMode }) {
  return (
    <small>
      語音會傳送至 OpenAI；
      {deploymentMode === "gcp"
        ? "逐字稿保存在 GCP 私人工作區。"
        : deploymentMode === "local"
          ? "本機僅保存逐字稿。"
          : "逐字稿儲存位置確認中。"}
      每通累計 {Math.min(drill.plot.maxVoiceSecondsPerCall ?? 600, 600)}{" "}
      秒，靜音也計時。可隨時插話或掛斷，建議戴耳機。
      逐字稿可能不完整，播放狀態不代表整句已聽完。
    </small>
  );
}
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

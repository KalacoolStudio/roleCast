import React from "react";

const scenes = {
  "anti-fraud": {
    image: "marketplace-fraud.png",
    alt: "買家、客服與銀行行員在溫暖的辦公室中進行電話互動",
    topics: ["識別異常", "保護資訊", "主動查證"],
  },
  interview: {
    image: "interview-panel.png",
    alt: "三位面試官在會議桌前閱讀履歷、提問與記錄",
    topics: ["資料庫遷移", "架構取捨", "清楚表達"],
  },
};
const customScene = {
  image: "office-background.png",
  alt: "準備迎接不同角色的溫暖辦公室",
  topics: ["進入情境", "多角色互動", "回顧與成長"],
};

export function CastMark() {
  return (
    <span className="cast-mark" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

export function Home({
  plots,
  plotId,
  onSelect,
  onStart,
  acting,
  activeId,
  onResume,
  deploymentMode,
  voiceAvailability,
}) {
  const plot = plots.find((value) => value.id === plotId);
  const scene = scenes[plotId] || customScene;

  return (
    <div className="home">
      <div className="rolecast-intro">
        <CastMark />
        <div>
          <h1>RoleCast</h1>
          <p className="rolecast-tagline">讓對的角色，在對的時刻登場。</p>
          <p className="rolecast-description">
            根據你的每次反應，即時安排下一個登場的角色。
          </p>
        </div>
      </div>

      <section className="scenario-showcase" aria-label="情境預覽">
        <div className="showcase-heading" aria-live="polite">
          <span className="showcase-status">
            <i aria-hidden="true" /> 角色編排預覽
          </span>
          <h2>{plot?.name || "準備你的下一場對話"}</h2>
          <span className="showcase-category">
            {plot?.category || "多角色互動"}
          </span>
        </div>
        <div className="scene-frame">
          <img
            className="scenario-scene"
            src={`/assets/scenes/${scene.image}`}
            alt={scene.alt}
            width={scene === customScene ? 1446 : 1672}
            height={scene === customScene ? 1087 : 941}
          />
        </div>
        <div className="scene-topics" aria-label="練習重點">
          {scene.topics.map((topic, index) => (
            <span key={topic} className={index === 1 ? "highlighted" : ""}>
              {topic}
            </span>
          ))}
        </div>
        <p className="showcase-note">每一次回應，都讓故事走向不同的下一步。</p>
      </section>

      <section className="scenario-picker" aria-labelledby="picker-title">
        <span className="picker-count" aria-hidden="true">
          01
        </span>
        <div className="picker-heading">
          <div className="eyebrow">YOUR NEXT CONVERSATION</div>
          <h2 id="picker-title">選擇今天的練習</h2>
          <p>你的反應，會改變接下來的角色與情境走向。</p>
        </div>
        <div className="plot-grid" role="group" aria-label="模擬情境">
          {plots.map((value) => (
            <button
              className={`plot-card ${plotId === value.id ? "chosen" : ""}`}
              key={value.id}
              onClick={() => onSelect(value.id)}
              aria-pressed={plotId === value.id}
            >
              <span className="plot-card-copy">
                <strong>{value.name}</strong>
                <small>
                  {value.category} · {value.duration}
                </small>
              </span>
              <span className="radio" aria-hidden="true" />
            </button>
          ))}
        </div>
        <p className="scenario-hint" aria-live="polite">
          {plot?.description || "選擇一個劇本，開始你的對話練習。"}
        </p>
        <div className="scenario-meta">
          <span>多角色動態登場</span>
          <span>即時語音互動</span>
        </div>
        <button
          className="primary start-button"
          onClick={onStart}
          disabled={
            acting ||
            !plot ||
            !deploymentMode ||
            !!activeId ||
            voiceAvailability !== "available"
          }
        >
          {voiceAvailability === "checking"
            ? "正在檢查語音…"
            : acting
              ? "正在開始…"
              : "開始演練"}
          <span aria-hidden="true">↗</span>
        </button>
        {voiceAvailability === "unavailable" && (
          <p className="hint" role="status">
            語音尚未設定，請在 .env 設定 API_KEY 並重新啟動服務。
          </p>
        )}
        {activeId && (
          <button className="resume-link" onClick={() => onResume(activeId)}>
            繼續目前演練 →
          </button>
        )}
        <p className="privacy">
          {deploymentMode === "gcp"
            ? "紀錄保存在 GCP，並與其他瀏覽器工作區隔離。"
            : deploymentMode === "local"
              ? "紀錄保存在本機。"
              : "正在確認紀錄儲存位置。"}
          演練內容會送至你設定的外部 LLM API 進行推論。
        </p>
      </section>

      <div className="how" aria-label="你的練習路徑">
        <p>
          <b>01</b> 選擇情境
        </p>
        <i aria-hidden="true">→</i>
        <p>
          <b>02</b> 展開對話
        </p>
        <i aria-hidden="true">→</i>
        <p>
          <b>03</b> 回看與成長
        </p>
      </div>
    </div>
  );
}

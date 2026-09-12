import React, { useEffect, useRef, useState } from "react";
import "./marketplace.css";

const asset = "/assets/marketplace/";
const rows = [
  { text: "您好，耳機還在嗎？配件都有嗎？" },
  { text: "還在，配件都有，已經幫你確認好了。", mine: true },
  { text: "好，謝謝！我現在下單。" },
  { text: "我這邊沒辦法下單，出現這個畫面，你可以幫忙確認一下嗎？" },
  { kind: "notice" },
  { text: "這是畫面提供的客服聯絡卡。" },
  { kind: "contact" },
];

function OrderNotice() {
  return (
    <span className="market-notice">
      <span className="market-notice-bar">交易訊息</span>
      <span className="market-notice-title">‹ 訂單狀態</span>
      <span className="market-notice-ref">訂單編號 RC-1024</span>
      <span className="market-notice-banner">
        <span className="market-notice-mark" aria-hidden="true">
          !
        </span>
        <span>
          <strong>訂單無法成立</strong>
          <small>本次結帳未完成</small>
        </span>
      </span>
      <span className="market-notice-section">
        <small>系統訊息 · ERR-PAY-201</small>
        <strong>此賣家目前無法使用平台金流服務</strong>
        <span>
          收款功能尚未完成驗證，系統暫時無法建立訂單。請稍後再試，或選擇其他賣家。
        </span>
      </span>
      <span className="market-notice-section">
        <small>交易摘要</small>
        <span className="market-notice-product">
          <img src={`${asset}headphones.jpg`} alt="二手無線耳機" />
          <span>
            二手無線耳機 · 九成新
            <br />
            配件完整
          </span>
        </span>
        <span className="market-notice-row">
          <span>商品數量</span>
          <span>1 件</span>
        </span>
        <span className="market-notice-row">
          <span>商品金額</span>
          <span>NT$ 1,800</span>
        </span>
        <span className="market-notice-row">
          <span>訂單狀態</span>
          <span>未成立</span>
        </span>
      </span>
      <span className="market-notice-foot">
        情境示意 · 買家傳送的圖片，尚未經平台核實
      </span>
    </span>
  );
}

export function MarketplaceIntro({
  onContinue,
  onBack,
  acting,
  activeId,
  onResume,
}) {
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [count, setCount] = useState(() => (reduced ? rows.length : 1));
  const [verified, setVerified] = useState(false);
  const dialog = useRef(null);
  const heading = useRef(null);
  const complete = count === rows.length;

  useEffect(() => {
    heading.current?.focus();
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => {
      setReduced(media.matches);
      if (media.matches) setCount(rows.length);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    if (complete || reduced || verified || acting) return;
    const timer = setTimeout(() => setCount((value) => value + 1), 1100);
    return () => clearTimeout(timer);
  }, [count, complete, reduced, verified, acting]);

  const replay = () => {
    setVerified(false);
    setCount(reduced ? rows.length : 1);
  };

  return (
    <section className="marketplace-intro" aria-labelledby="market-heading">
      <div className="market-intro-heading">
        <div>
          <div className="eyebrow">防詐警覺演練 · 情境示範</div>
          <h1 id="market-heading" ref={heading} tabIndex={-1}>
            從一則商品詢問開始
          </h1>
          <p>先看看這段預先編排的對話，再決定下一步。</p>
        </div>
        <button className="market-back" onClick={onBack} disabled={acting}>
          返回劇本大廳
        </button>
      </div>

      {verified ? (
        <div className="market-result" role="status">
          <span className="market-result-icon" aria-hidden="true">
            ✓
          </span>
          <h2>你選擇了獨立查證</h2>
          <p>
            這段示範在此結束。遇到交易疑問，可以自行從官方網站或 App
            尋找客服，不依賴對方傳來的聯絡卡。
          </p>
          <p>這是情境選擇，尚未進行實際查證或通話評估。</p>
          <button
            className="primary"
            onClick={() => {
              setCount(rows.length);
              setVerified(false);
            }}
          >
            返回聊天室
          </button>
        </div>
      ) : (
        <div className="market-chat">
          <header className="market-chat-header">
            <img
              className="market-avatar"
              src={`${asset}buyer.jpg`}
              alt="Lin 的情境帳號頭像"
            />
            <div>
              <h2>Lin</h2>
              <p>@lin_daily_082 · 情境帳號</p>
            </div>
            <span className="market-example-tag">示範對話</span>
          </header>
          <div className="market-product">
            <img src={`${asset}headphones.jpg`} alt="木桌上的黑灰色無線耳機" />
            <div>
              二手無線耳機 · 九成新<strong>NT$ 1,800</strong>
            </div>
          </div>
          <div
            className="market-messages"
            role="log"
            aria-label="與 Lin 的示範對話"
            aria-relevant="additions"
          >
            <div className="market-time">情境開始</div>
            {rows.slice(0, count).map((row, index) => (
              <React.Fragment key={index}>
                {index === 3 && <div className="market-new-label">新訊息</div>}
                <div className={`market-message ${row.mine ? "mine" : ""}`}>
                  {!row.mine && (
                    <img
                      className="market-bubble-avatar"
                      src={`${asset}buyer.jpg`}
                      alt=""
                    />
                  )}
                  {row.kind === "notice" ? (
                    <button
                      className="market-attachment"
                      aria-label="放大買家傳送的結帳失敗示意截圖"
                      onClick={() => dialog.current.showModal()}
                    >
                      <OrderNotice />
                      <span className="market-enlarge">點擊放大 ↗</span>
                    </button>
                  ) : row.kind === "contact" ? (
                    <div className="market-contact">
                      <div className="market-contact-head">
                        <span
                          className="market-service-icon"
                          aria-hidden="true"
                        >
                          S
                        </span>
                        <strong>客服聯絡卡</strong>
                        <small>買家提供 · 情境示意</small>
                      </div>
                      <p>交易問題諮詢</p>
                      <button
                        className="primary"
                        onClick={onContinue}
                        disabled={acting || !!activeId}
                      >
                        {acting ? "正在準備通話…" : "申請客服回電"}
                      </button>
                      <small className="market-handoff">
                        接下來進入獨立的通話演練，由你親自回應。
                      </small>
                    </div>
                  ) : (
                    <p className="market-bubble">
                      <span className="sr-only">
                        {row.mine ? "你（情境預設）：" : "Lin："}
                      </span>
                      {row.text}
                    </p>
                  )}
                </div>
              </React.Fragment>
            ))}
            {!complete && (
              <div className="market-typing" role="status">
                對話播放中…
              </div>
            )}
          </div>
          <div className="market-actions">
            <button onClick={() => setVerified(true)} disabled={acting}>
              自行找官方客服確認
            </button>
            <div className="market-playback">
              {!complete && (
                <button onClick={() => setCount(rows.length)} disabled={acting}>
                  顯示完整對話
                </button>
              )}
              <button onClick={replay} disabled={acting}>
                重播對話
              </button>
            </div>
          </div>
          <p className="market-chat-note">
            以上為示範內容；你的通話演練與回饋將從接通後開始。
          </p>
        </div>
      )}
      {activeId && (
        <button className="resume-link" onClick={() => onResume(activeId)}>
          繼續目前演練 →
        </button>
      )}
      <dialog
        className="market-dialog"
        ref={dialog}
        aria-labelledby="market-dialog-title"
      >
        <h2 id="market-dialog-title">買家傳送的訂單示意</h2>
        <OrderNotice />
        <form method="dialog">
          <button className="primary">返回聊聊</button>
        </form>
      </dialog>
    </section>
  );
}

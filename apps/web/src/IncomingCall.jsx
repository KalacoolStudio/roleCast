import React, { useEffect, useRef } from "react";
import "./incoming-call.css";

function callerMark(name) {
  const words = name.trim().split(/\s+/);
  if (/^[a-z]/i.test(words[0]))
    return words
      .slice(0, 2)
      .map((word) => Array.from(word)[0])
      .join("")
      .toUpperCase();
  return Array.from(words[0])[0] || "?";
}

export function IncomingCall({
  open,
  onDismiss,
  returnFocusRef,
  error,
  persona,
  plotId,
  acting,
  finishRequested,
  voice,
  onAnswer,
  onDecline,
  children,
}) {
  const dialogRef = useRef(null);
  const headingRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const body = document.body;
    const { overflow, paddingRight } = body.style;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0)
      body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + scrollbarWidth}px`;
    body.style.overflow = "hidden";
    dialog.showModal();
    headingRef.current.focus({ preventScroll: true });
    return () => {
      dialog.close();
      body.style.overflow = overflow;
      body.style.paddingRight = paddingRight;
      const target = returnFocusRef.current?.isConnected
        ? returnFocusRef.current
        : previousFocus?.isConnected && previousFocus !== body
          ? previousFocus
          : document.querySelector(
              ".voice-panel button:not(:disabled), .call-controls button:not(:disabled)",
            );
      target?.focus({ preventScroll: true });
    };
  }, [open, returnFocusRef]);
  const theme =
    plotId === "interview"
      ? "interview"
      : plotId === "anti-fraud"
        ? "marketplace"
        : "custom";
  const busy = acting || voice.active || finishRequested;
  const status =
    acting || finishRequested
      ? "正在結束演練…"
      : voice.state === "preparing"
        ? "正在準備麥克風…"
        : voice.active
          ? "正在連接語音…"
          : voice.availability === "checking"
            ? "正在確認語音功能…"
            : !voice.available
              ? "語音目前無法使用，請重新啟動服務後再試。"
              : "來電中…";

  return (
    <dialog
      ref={dialogRef}
      id="incoming-call-dialog"
      className="incoming-call"
      aria-labelledby="incoming-caller-name"
      aria-describedby="incoming-call-status"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = event.currentTarget.querySelectorAll(
          "button:not(:disabled)",
        );
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (!first) {
          event.preventDefault();
          headingRef.current.focus({ preventScroll: true });
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onDismiss();
      }}
      onClick={(event) => {
        if (busy || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onDismiss();
      }}
    >
      <div className="incoming-call-content">
        <button
          type="button"
          className="incoming-call-close"
          aria-label="收合來電視窗"
          disabled={busy}
          onClick={onDismiss}
        >
          <span aria-hidden="true">×</span>
        </button>
        <p className="incoming-call-eyebrow">語音來電</p>
        <div className={`incoming-call-badge ${theme}`} aria-hidden="true">
          {theme === "interview" ? "HR" : callerMark(persona.name)}
        </div>
        <h2 id="incoming-caller-name" ref={headingRef} tabIndex={-1}>
          {persona.name}
        </h2>
        <p className="incoming-call-role">{persona.role}</p>
        <p
          className="incoming-call-status"
          id="incoming-call-status"
          role="status"
        >
          {status}
        </p>
        {error && (
          <p className="incoming-call-error" role="alert">
            {error}
          </p>
        )}
        <div className="incoming-call-actions">
          <button
            type="button"
            className="incoming-call-decline"
            disabled={busy}
            aria-describedby="incoming-decline-help"
            onClick={onDecline}
          >
            <Handset />
            拒接
          </button>
          <button
            type="button"
            className="incoming-call-answer"
            disabled={busy || !voice.available}
            onClick={onAnswer}
          >
            <Handset />
            接聽
          </button>
        </div>
        <p className="incoming-call-help" id="incoming-decline-help">
          拒接將結束這場演練。
        </p>
        <div className="incoming-call-disclosure">{children}</div>
      </div>
    </dialog>
  );
}

function Handset() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="m7 3-3 1c-3 1 0 8 4 12s11 7 12 4l1-3-5-3-2 2c-2-1-5-4-6-6l2-2-3-5Z" />
    </svg>
  );
}

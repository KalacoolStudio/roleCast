import React, { useEffect, useRef, useState } from "react";

const money = (value) => `NT$ ${value.toLocaleString("zh-TW")}`;

export function AtmDrawer({ drill, call, enabled, onAction }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("transfer");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(null);
  const available =
    enabled && drill.state === "in_call" && call && !call.endedAt;
  const transactions = drill.atm?.transactions ?? [];

  useEffect(() => {
    setOpen(false);
    setAmount("");
    setRecipient("");
    setNotice("");
    setError("");
    pending.current = null;
  }, [drill.id]);

  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  const selectMode = (next) => {
    setMode(next);
    setAmount("");
    setRecipient("");
    setNotice("");
    setError("");
    pending.current = null;
  };

  const submit = async (event) => {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value < 1) {
      setError("請輸入大於 0 的整數金額。");
      return;
    }
    const normalizedRecipient = recipient.replace(/[ -]/g, "");
    if (mode === "transfer" && !/^\d{4,32}$/.test(normalizedRecipient)) {
      setError("請輸入 4 至 32 位數的收款帳號。");
      return;
    }
    const intent = JSON.stringify({
      action: mode,
      amount: value,
      recipient: mode === "transfer" ? normalizedRecipient : undefined,
    });
    if (!pending.current || pending.current.intent !== intent)
      pending.current = {
        intent,
        clientActionId: crypto.randomUUID(),
      };
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await onAction({
        action: mode,
        amount: value,
        ...(mode === "transfer" ? { recipient: normalizedRecipient } : {}),
        clientActionId: pending.current.clientActionId,
      });
      pending.current = null;
      setAmount("");
      setRecipient("");
      setNotice(
        `${mode === "transfer" ? "匯款" : "提款"}完成，Judge 已收到操作紀錄。`,
      );
    } catch (reason) {
      setError(reason.message || "ATM 操作未完成，請稍後重試。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`atm-drawer-root ${open ? "open" : ""}`}>
      <button
        type="button"
        className="atm-drawer-tab"
        aria-controls="atm-drawer"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">▣</span>
        ATM
      </button>
      {open && (
        <button
          type="button"
          className="atm-backdrop"
          aria-label="關閉 ATM"
          onClick={() => setOpen(false)}
        />
      )}
      <aside id="atm-drawer" className="atm-drawer" aria-label="ATM 操作">
        <header>
          <div>
            <small>SIMULATION ACCOUNT</small>
            <h2>ATM</h2>
          </div>
          <button
            type="button"
            className="atm-close"
            aria-label="關閉 ATM"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </header>

        <section className="atm-balance" aria-label="帳戶餘額">
          <small>可用餘額</small>
          <strong>{money(drill.atm?.balance ?? 100000)}</strong>
          <span>模擬帳戶 · 即時更新</span>
        </section>

        <div className="atm-actions" role="tablist" aria-label="ATM 功能">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "transfer"}
            onClick={() => selectMode("transfer")}
          >
            <span aria-hidden="true">↗</span>匯款
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "withdraw"}
            onClick={() => selectMode("withdraw")}
          >
            <span aria-hidden="true">↓</span>提款
          </button>
        </div>

        <form className="atm-form" onSubmit={submit}>
          <h3>{mode === "transfer" ? "匯款" : "提款"}</h3>
          {mode === "transfer" && (
            <label>
              收款帳號
              <input
                value={recipient}
                onClick={() => {
                  setRecipient("2580741036925814");
                  pending.current = null;
                }}
                onChange={(event) => {
                  setRecipient(event.target.value);
                  pending.current = null;
                }}
                inputMode="numeric"
                autoComplete="off"
                placeholder="輸入收款帳號"
                maxLength={32}
                disabled={!available || busy}
              />
            </label>
          )}
          <label>
            {mode === "transfer" ? "匯款金額" : "提款金額"}
            <div className="atm-amount">
              <span>NT$</span>
              <input
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  pending.current = null;
                }}
                placeholder="0"
                disabled={!available || busy}
              />
            </div>
          </label>
          {!available && (
            <p className="atm-hint">語音接通後即可進行 ATM 操作。</p>
          )}
          {error && (
            <p className="atm-feedback error-text" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="atm-feedback success-text" role="status">
              {notice}
            </p>
          )}
          <button
            type="submit"
            className="atm-submit"
            disabled={!available || busy}
          >
            {busy ? "處理中…" : `確認${mode === "transfer" ? "匯款" : "提款"}`}
          </button>
        </form>

        <section className="atm-history">
          <div>
            <h3>本場操作紀錄</h3>
            <small>{transactions.length} 筆</small>
          </div>
          {transactions.length ? (
            <ul>
              {[...transactions]
                .reverse()
                .slice(0, 6)
                .map((entry) => (
                  <li key={entry.id}>
                    <span>{entry.action === "transfer" ? "匯款" : "提款"}</span>
                    <strong>− {money(entry.amount)}</strong>
                    <small>餘額 {money(entry.balanceAfter)}</small>
                  </li>
                ))}
            </ul>
          ) : (
            <p>尚無 ATM 操作。</p>
          )}
        </section>
      </aside>
    </div>
  );
}

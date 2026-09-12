import React, { useState } from "react";
import {
  blankPlot,
  plotDefinition,
  parsePlot,
  exportPlot,
  importPlot,
} from "../../../packages/core/src/plot-contracts.js";

export function PlotEditor({ plots, api, onSaved, onUse }) {
  const [draft, setDraft] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const change = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setNotice("");
  };
  const begin = (value, current = null) => {
    setDraft(value);
    setIdentity(current);
    setError("");
    setNotice("");
    setDirty(false);
  };
  const perform = async (fn) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e.message || "劇本操作失敗，請重試。");
    } finally {
      setBusy(false);
    }
  };
  const open = (id, copy = false) =>
    perform(async () => {
      const plot = await api(`/plots/${id}`);
      const value = plotDefinition(plot);
      if (copy) value.name += "（副本）";
      begin(value, copy ? null : { id: plot.id, version: plot.version });
    });
  const save = (event) => {
    event.preventDefault();
    perform(async () => {
      const value = parsePlot(draft);
      const saved = await api(
        identity ? `/plots/${identity.id}` : "/plots",
        identity ? { ...value, version: identity.version } : value,
        identity ? "PUT" : "POST",
      );
      begin(plotDefinition(saved), { id: saved.id, version: saved.version });
      setNotice(`已儲存劇本 · v${saved.version}`);
      await onSaved(saved);
    });
  };
  const download = () =>
    perform(async () => {
      const blob = new Blob([exportPlot(draft)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `plot-${identity?.id || "draft"}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  const upload = (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    perform(async () => {
      if (file.size > 262144) throw new Error("劇本檔案不可超過 256 KB。");
      begin(importPlot(await file.text()));
      setNotice("已匯入草稿，儲存後會建立新的 plot。");
    });
  };
  const field = (key, label, maxLength, multiline = false, help = null) => (
    <label className="plot-field" key={key}>
      <span>{label}</span>
      {help && <small>{help}</small>}
      {multiline ? (
        <textarea
          required
          aria-label={label}
          value={draft[key]}
          maxLength={maxLength}
          rows={3}
          onChange={(e) => change(key, e.target.value)}
        />
      ) : (
        <input
          required
          aria-label={label}
          value={draft[key]}
          maxLength={maxLength}
          onChange={(e) => change(key, e.target.value)}
        />
      )}
    </label>
  );
  return (
    <section className="plot-studio">
      <div className="eyebrow">PLOT STUDIO</div>
      <h1>你的劇本工作室</h1>
      <p className="intro">
        一個 plot，是可以反覆練習的劇本。
        <br />
        每次開始，都是獨立的一場 drill。
      </p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <p className="plot-notice" role="status">
          {notice}
        </p>
      )}
      {!draft ? (
        <>
          <div className="plot-toolbar">
            <button
              className="primary"
              disabled={busy}
              onClick={() => begin(blankPlot())}
            >
              ＋ 新增劇本
            </button>
            <label className="file-button">
              匯入 JSON
              <input
                aria-label="匯入劇本 JSON"
                type="file"
                accept=".json,application/json"
                onChange={upload}
                disabled={busy}
              />
            </label>
          </div>
          <div className="plot-library">
            {plots.map((plot) => (
              <article key={plot.id}>
                <span className="category">
                  {plot.category} · v{plot.version}
                </span>
                <h2>{plot.name}</h2>
                <p>{plot.description}</p>
                <div className="plot-toolbar">
                  <button disabled={busy} onClick={() => open(plot.id)}>
                    編輯
                  </button>
                  <button disabled={busy} onClick={() => open(plot.id, true)}>
                    複製
                  </button>
                  <button disabled={busy} onClick={() => onUse(plot.id)}>
                    使用此劇本 ↗
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <form onSubmit={save} className="plot-form">
          <div className="plot-form-title">
            <h2>{identity ? "編輯劇本" : "新增劇本"}</h2>
            <span>
              {identity ? `v${identity.version}` : "新 plot"}
              {dirty ? " · 尚未儲存" : ""}
            </span>
          </div>
          <p className="hint">
            儲存只影響之後開始的 drill，現有演練使用原本的劇本版本。
          </p>
          <fieldset disabled={busy}>
            <legend>劇本設定</legend>
            <div className="plot-two-columns">
              {field("name", "劇本名稱", 120)}
              {field("category", "分類", 60)}
            </div>
            {field("description", "劇本簡介", 1000, true)}
            {field("duration", "預估時間", 80)}
            {field("goal", "演練目標", 6000, true)}
            <div className="plot-two-columns">
              {[
                ["maxCalls", "最多通話數", 3],
                ["maxUserTurnsPerCall", "每通最多回合數", 12],
              ].map(([key, label, max]) => (
                <label className="plot-field" key={key}>
                  <span>{label}</span>
                  <input
                    type="number"
                    required
                    min={1}
                    max={max}
                    value={draft[key]}
                    onChange={(e) =>
                      change(
                        key,
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>固定事實與評估</legend>
            <p className="hint">
              固定事實供 Mastermind 指派給 Persona；評估判準供 Judge 與 Reporter
              使用。ID 必須唯一。
            </p>
            <Rows
              title="固定事實"
              values={draft.facts}
              fields={[
                ["id", "事實 ID", 100],
                ["key", "事實名稱", 120],
                ["value", "事實內容", 2000],
              ]}
              change={(v) => change("facts", v)}
            />
            <Rows
              title="評估判準"
              values={draft.criteria}
              fields={[
                ["id", "判準 ID", 100],
                ["description", "判準內容", 2000],
              ]}
              change={(v) => change("criteria", v)}
            />
            {field("stopCondition", "停止條件", 4000, true)}
          </fieldset>
          <fieldset disabled={busy}>
            <legend>角色 Prompts</legend>
            <p className="hint">
              描述角色的目標、風格與判斷重點。系統會自動加入輸出格式與證據規則。
            </p>
            {[
              [
                "mastermind",
                "Mastermind prompt",
                "安排角色、指派任務與決定演練進度。",
              ],
              [
                "judge",
                "Judge prompt",
                "用於通話中的即時判斷，以及掛斷後的回顧。",
              ],
              [
                "reporter",
                "Reporter prompt",
                "依逐字稿與回顧撰寫最終報告，可設定回饋重點與語氣。",
              ],
            ].map(([role, label, help]) => (
              <label className="plot-field" key={role}>
                <span>{label}</span>
                <small>{help}只設定行為與評估重點，輸出欄位由系統固定。</small>
                <textarea
                  className="prompt-input"
                  aria-label={label}
                  required
                  rows={5}
                  maxLength={12000}
                  value={draft.prompts[role]}
                  onChange={(e) =>
                    change("prompts", {
                      ...draft.prompts,
                      [role]: e.target.value,
                    })
                  }
                />
              </label>
            ))}
          </fieldset>
          <div className="plot-save-bar">
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "處理中…" : "儲存劇本"}
            </button>
            <button type="button" disabled={busy} onClick={download}>
              匯出 JSON
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setError("");
                setNotice("");
              }}
            >
              {dirty ? "放棄草稿並返回" : "返回劇本列表"}
            </button>
            {identity && (
              <button
                type="button"
                disabled={busy || dirty}
                onClick={() => onUse(identity.id)}
              >
                使用此劇本 ↗
              </button>
            )}
            {identity && error && (
              <button
                type="button"
                disabled={busy}
                onClick={() => open(identity.id)}
              >
                放棄草稿並重新載入
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
function Rows({ title, values, fields, change }) {
  return (
    <div className="plot-rows">
      <h3>
        {title} <small>{values.length}/30</small>
      </h3>
      {values.map((row, index) => (
        <div className="plot-row" key={index}>
          {fields.map(([key, label, maxLength]) => {
            const Input = maxLength > 120 ? "textarea" : "input";
            return (
              <label className="plot-field" key={key}>
                <span>
                  {label} {index + 1}
                </span>
                <Input
                  required
                  aria-label={`${label} ${index + 1}`}
                  maxLength={maxLength}
                  value={row[key]}
                  onChange={(e) =>
                    change(
                      values.map((value, i) =>
                        i === index
                          ? { ...value, [key]: e.target.value }
                          : value,
                      ),
                    )
                  }
                />
              </label>
            );
          })}
          <button
            type="button"
            aria-label={`移除${title} ${index + 1}`}
            onClick={() => change(values.filter((_, i) => i !== index))}
          >
            移除
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={values.length >= 30}
        onClick={() =>
          change([
            ...values,
            Object.fromEntries(
              fields.map(([key]) => [
                key,
                key === "id" ? crypto.randomUUID() : "",
              ]),
            ),
          ])
        }
      >
        ＋ 新增{title}
      </button>
    </div>
  );
}

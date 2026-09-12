## Why

目前演練頁以狀態文字與逐字稿呈現進度，使用者無法直接看見 Mastermind、Judge 與 Persona 如何分工及交接。加入與真實演練同步的角色舞台，讓等待、接通、監看與回報成為可理解的空間動作，並為後續辦公室背景建立站位與動線。

## What Changes

- 在現有 drill 頁加入素色角色舞台，桌面採舞台與對話並排，手機採上下排列，保留接通、送出、掛斷、結束整場及報告操作。
- 使用既有 Mastermind、Judge 與三種 Persona 圖集，呈現思考、角色進場、通話監看、離場及回報；同一 Persona 重用時保留外觀與身分。
- 保存具有順序編號的公開舞台事件，以 SSE 傳送並支援重新連線補接，避免快速狀態切換遺漏交接動作。
- 以伺服器狀態決定可操作行為，動畫不阻塞 LLM 或使用者控制；支援快速追上進度、重新整理、失敗與減少動態效果。
- 僅顯示工作狀態提示，不公開內部推理、隱藏任務、Judge 私有回顧或評分。Reporter 仍負責總報告，以狀態卡呈現。

## Capabilities

### New Capabilities

- `drill-stage-presentation`: 角色舞台、固定動線、素材映射、響應式介面及動畫與通話操作同步。
- `drill-stage-events`: 公開事件保存、排序、即時傳送、補接與快照還原。

### Modified Capabilities

無。`openspec/specs/` 目前無主規格；本次新增能力延伸既有 changes 中的生命週期及文字介面要求，不改變接通、掛斷、角色記憶與評估規則。

## Impact

- 前端：`apps/web/src/main.jsx`、`style.css` 與新增舞台、圖集設定、事件消費及動畫控制模組。
- 素材：`apps/web/public/assets/characters/warm/`；保留來源圖集，必要時以衍生素材處理背景與裁切。
- 後端與儲存：`packages/core/src/engine.js`、`packages/storage/src/store.js`、`apps/server/src/app.js`；新增 SQLite 遷移、事件讀取及 SSE API，既有 REST 與 legacy routes 保持相容。
- 驗證與文件：擴充現有 Vitest／Playwright、README 與 `just` 操作說明。沿用 JavaScript／JSX、React、Fastify 及 SQLite，無新增付費服務。

## Non-goals

辦公室背景、家具、自由走動或操控玩家、多人共用世界、碰撞與尋路、語音通話、模型逐 token 串流、內部推理展示、完整歷史動畫重播，以及第四個 Reporter 動畫角色均不在本次範圍。

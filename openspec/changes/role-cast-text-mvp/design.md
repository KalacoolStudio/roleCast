## Context

動機與產品範圍見 proposal.md。專案目前只有 guidelines、OpenSpec 與已驗證的 just 指令清單，沒有需要相容的 API 或資料模型。使用者已確認全 JavaScript、外部 LLM API、後端 `.env` 金鑰及 just 操作入口。

以下採單機、單使用者、瀏覽器文字介面作為 MVP 設計預設。後端僅綁定 loopback；遠端開放、多使用者與自動續接中斷的演練不在本次部署模型內。

## Goals / Non-Goals

**Goals:** 將通話控制與 LLM 建議分離；確保取消、重複請求、失敗及重啟時狀態一致；提供不依賴真實 API key 的可重現驗證。

**Non-Goals:** token 逐字串流、語音傳輸、自由互相委派的 Agent 群組、分散式工作佇列、跨程序自動恢復與通用供應商私有 API 相容層。

## Decisions

### 1. JavaScript workspace 與分層

採 Node.js ESM、npm workspace、Fastify、React + Vite、AI SDK Core + OpenAI-compatible provider、Zod 與 SQLite。應用、測試、設定檔使用 `.js` / `.jsx`，不用 Python 或 TypeScript 原始碼。套件版本於實作時選擇相互相容的穩定版本並鎖入 package-lock.json，README 與 engines 明定實際驗證過的 Node 版本。

建議目錄：

```text
apps/server/src/       HTTP routes, configuration, public projections
apps/web/src/          React participant UI
packages/core/src/     state machine, scenarios, contracts, agent ports
packages/storage/src/ SQLite repositories and migrations
tests/                integration and browser tests, model fixtures
scripts/              JavaScript development and status helpers
data/                 ignored local database
```

Fastify 負責請求驗證、錯誤處理與部署後靜態資產；核心邏輯不依賴 HTTP。AI SDK 統一模型存取，Zod 驗證模型 JSON，再以核心規則驗證角色、事實及證據 ID。採 SQLite Node binding（優先 `better-sqlite3`，安裝需使用支援所選 Node 的版本），短交易與 WAL；任何模型呼叫都不持有資料庫交易。

相較 Next.js 全端框架，本機互動介面沒有 SEO 或 server rendering 需求；Vite 配獨立 API 較直接。相較 LangGraph，明確的小型狀態機足以實作本次通話邊界；若未來要求流程重播與跨程序續接，再評估導入持久執行框架。

### 2. LLM adapter 與設定

API 服務尚未指定，採 OpenAI-compatible Chat Completions 作為提案預設協定，不固定供應商或模型。根目錄 `.env`：

```dotenv
LLM_API_KEY=
LLM_BASE_URL=
LLM_MODEL=
PORT=3000
DATABASE_PATH=./data/role-cast.sqlite
```

三個 `LLM_*` 為必填；base URL 須為有效 http(s) URL，不含內嵌帳密。程序環境優先於 `.env`。正式啟動檢查設定，測試以 dependency injection 使用模型替身，不走真實設定驗證。`.env.example` 只放空白或非秘密的說明值；setup 僅在 `.env` 不存在時複製，不讀取或覆寫使用者已填的秘密。

由後端建立 adapter，提供 plan、reply、watch、recap、report 操作及 AbortSignal。模型須支援依提示輸出 JSON；採文字 JSON 加本機 schema 驗證作為基準，不要求供應商的 native structured-output 功能。模型輸出只表達建議，不能直接操作儲存層或通話控制。

每次邏輯模型操作最多 2 次嘗試，每次 30 秒逾時，明確設定 SDK retry 以避免巢狀倍增。格式修復只送有限的驗證摘要；429/暫時性 5xx 可在預算內重試，401/403 與取消不重試。耗盡後標記演練失敗。各次模型輸出上限為 4,000 tokens，選填背景最多 2,000 個 Unicode code points、單則使用者訊息最多 4,000 個；超限輸入回 400。情境快照包含 maxCalls=3、maxUserTurnsPerCall=12，以限制總上下文與費用。達回合上限時完成本通並回顧，達通話上限則產出總報告。

LLM_API_KEY 不使用 `VITE_` 前綴。Vite 不載入後端秘密為 client define；API、DB、日誌皆採明確欄位清單，禁止記錄供應商原始請求/錯誤物件、Authorization 或 key。本機保存不代表離線：README 及開始畫面說明推論內容會送往設定的 API。

### 3. 狀態機是唯一控制權來源

```text
planning --> awaiting_call --> in_call --> recapping --> planning
   |              |              |            |
   +--------------+--------------+------------+--> reporting --> completed

any nonterminal --> failed
restart with nonterminal state --> interrupted
```

planning 收到有效新指派才進入 awaiting_call，使用者按接通後才建立 active call 並生成開場。Mastermind 可在 planning 選擇 finish 進入 reporting。規劃出的待接通指派不計入已接通通話數；若使用者此時結束，直接報告。

每場保存固定的 Mastermind/Judge prompt 與情境快照。Persona ID 與不可變人設獨立於通話；assignment 保存 goal、personaId、allowedFactIds 與當次 facts 快照。固定事實使用有 ID 的 key/value 記錄，建立角色時一次提交可驗證的虛構人設，之後同 ID 的人設不可改寫。使用者透露的新資訊以訊息 ID 作為來源；Mastermind 交付其他角色時必須引用已有來源。拒絕沒有來源的新背景事實與對同 key 的矛盾修改。

Persona 只接收自己的歷史、目前任務及允許事實；Judge 接收評分準則與實際雙方對話，不接收 Mastermind 私有推理。Mastermind 接收累積紀錄與 Recap。所有角色提示都將對話當作待處理資料，使用者文字不取得系統控制權。

每場有序執行狀態轉移，但不在等待 LLM 時鎖住整場；每個非同步工作攜帶 sessionId、callId 與 generationVersion。先以交易保存有效狀態與新 version，再發布事件或接受新工作。結果回來時重新檢查這些值，防止舊工作寫入。

### 4. 回合並行、關閉優先與冪等

每通最多一個處理中的使用者回合。先交易保存 user message 及 clientMessageId，再同時啟動 Persona reply 與 Judge watch。Judge 使用包含該 user message 的已提交逐字稿。Persona 回傳結構化 text 與 requestHangup，完整暫存到 watch=continue 才可提交；watch=stop 先關閉通話並取消/丟棄回覆。這保留並行運作，又避免把已被判定應停止的下一句顯示出去，代價是回覆顯示時間取兩者較慢者。

Persona 開場不需 user watch；Judge 的即時 Watch 對象是每個使用者訊息，Recap 則檢視最終雙方逐字稿。Persona 的 requestHangup 於回覆可發布後執行；使用者掛斷在等待回覆時也可立即生效。

closeCall 為冪等的條件更新：第一個有效終止原因勝出，後續 stop/hangup 不覆寫；遞增 version 並 abort 本通未完成工作，只對已接通通話排一次 Recap。正在 recapping 時使用者結束整場只設定 finishRequested，不重建 Recap；回顧完成後走 reporting。planning 時結束則取消規劃結果並報告；reporting 時再次結束為 no-op。recap/report 皆有唯一成功結果約束。

若 Watch/Persona 失敗且本通尚活躍，整場進入 failed 並取消其他工作；若本通已被關閉，該舊錯誤被忽略，不能讓回顧或下一通失敗。Recap/報告失敗保留已保存資料並終止，MVP 不提供自動重跑歷史演練。

### 5. 保存模型與重新整理

主要資料：sessions（scenario snapshot、state、version、finishRequested）、personas、assignments、calls（personaId、ordinal、endReason）、messages（sequence、clientMessageId、speaker、text）、watch_results、recaps、reports。儲存 schema version 與 migration；外鍵與唯一約束保護名冊、clientMessageId、每通 Recap 與每場 report。

訊息 ID 在同場唯一；證據 ID 必須指向本場既有訊息，Watch/Recap 進一步限制於該通。完成的 Persona 回覆才存為對使用者已送出的訊息。已接受 user message 必須先落盤再回覆接受成功。固定事實、Persona 記憶與逐字稿不依賴 process memory 存活。

前端刷新只重新取得快照。程序重啟則將非終止 session 改為 interrupted，未結束 call 記錄程序中斷；不自動恢復模型工作，也不補造 Recap/report。既有 completed/failed/interrupted 紀錄保持原狀並可查看。

### 6. HTTP 與瀏覽器互動

採 REST 指令加輪詢快照；處理中每 500ms 取得狀態，背景頁降低頻率，終止時停止輪詢。此 MVP 不需要 WebSocket/SSE 或音訊傳輸；更換傳輸方式不影響核心狀態機。

| API | 行為 |
| --- | --- |
| GET /api/health | 回傳服務與資料庫健康，不回傳秘密設定 |
| GET /api/scenarios | 情境名稱、簡介與輸入資訊，不揭露內部判準或 facts |
| POST /api/sessions | 建立並非同步規劃；全機 active session 唯一 |
| GET /api/sessions | 歷史列表與 active ID |
| GET /api/sessions/:id | 參與者可見狀態、當前角色與各通已提交訊息 |
| POST /api/sessions/:id/calls/accept | 接受特定待接通 assignment；重複接受不另開通話 |
| POST /api/sessions/:id/calls/:callId/messages | 驗證非空文字與 clientMessageId，保存後回 202；重複 ID 同內容回既有結果 |
| POST /api/sessions/:id/calls/:callId/hangup | 冪等掛斷該通 |
| POST /api/sessions/:id/finish | 冪等要求整場結束 |
| GET /api/sessions/:id/report | 取得已保存報告或明確尚未完成狀態 |

找不到資源回 404；狀態衝突（包括過期通話、忙碌回合、同 ID 不同文字）回 409；無效輸入回 400。非同步失敗經快照的分類錯誤呈現，不轉送原始 provider response。後端為每個回應組裝 public projection，讓回顧、提示與 facts 即使存在 DB 也不會意外傳至瀏覽器。

前端包括情境開始畫面、通話與狀態畫面、歷史/報告畫面；控制項支援鍵盤及明確標籤。使用者只看見 Persona，幕後處理只顯示中性進度。報告提供引用訊息的內容對照。開場/回合處理中鎖文字輸入，掛斷與結束仍可使用。

### 7. 可重現情境與驗證

防詐情境使用虛構訂單與銀行資訊，辨識是否明確質疑並提出查證；模擬面試涵蓋資料庫與架構取捨，避免以簡短同意代替能力證據。兩個情境使用相同核心流程及資料契約，情境定義為版本化靜態 JSON。MVP 沒有實際轉帳、個資蒐集工具或外部電話行為。

單元與整合測試使用 Vitest、可控制完成順序的 agent doubles 與暫存 SQLite。另以本機 HTTP provider stub 驗證真實 adapter 的請求、JSON 驗證、逾時、取消及錯誤整理。Playwright 測試實際頁面/API/DB，只有模型替換為測試用 fixture，fixture 注入不得成為 production 自動 fallback。

測試涵蓋新角色與回撥、私有資訊投影、雙擊與刷新、Judge stop 先/後完成、重複結束、Recap exactly-once、無效事實/證據、API 錯誤及重啟中斷。LLM 品質不由 mock 證明；README 提供人工 smoke checklist，使用者配置相容模型後可檢查中文回覆、情境推進與報告證據。實作交付需區分自動化已驗證與真實供應商尚未驗證結果。

### 8. just 與開發操作

保留預設 `just --list`，每個公開 recipe 都有用途註解。setup 使用 npm ci 安裝鎖定依賴、只在不存在時建立 `.env`、準備本機資料目錄。dev 啟動 Fastify :3000 與 Vite :5173（代理 /api），JavaScript supervisor 統一處理 SIGINT/SIGTERM 及任一子程序失敗；停止時不留下背景服務。build 建置前端；start 由 Fastify :3000 提供前端與 API。test 執行單元、整合與瀏覽器測試（README 說明 Playwright browser 安裝）；check 執行 ESLint 與格式檢查，不加入 TypeScript 編譯；status 檢查健康端點並在服務未啟動時清楚回報。

README 說明上述流程、API 協定要求、金鑰與本機資料處理、停止方式與 MVP 限制。`.gitignore` 忽略 `.env` 及其本機變體（保留 `.env.example`）、data、node_modules、dist、測試輸出。測試、check、build 不載入使用者 key 或發送真實 LLM 請求。

## Risks / Trade-offs

- 相容端點的 JSON 遵循能力不同 → 採本機 schema 驗證與有限修復，不宣稱所有模型皆能通過；人工 smoke 明示使用模型與結果。
- 模型可能產生語意上的錯誤，即使 JSON 合法 → 對不可變事實與引用作確定性檢查；提示及品質案例評估自由文字，避免宣稱模型永不幻覺。
- 等待 Judge 才發布完整 Persona 回覆增加延遲 → Persona/Watch 並行且顯示處理中；不設定尚未實測的即時延遲保證。
- SQLite 與程序內排程限制並行容量 → 本次明定單機單使用者、active session 唯一及重啟標記中斷。
- 使用外部 API 會傳送對話內容 → 使用者已選擇外部推論，介面與文件準確揭露資料流向；金鑰完全隔離於後端。

## Migration Plan

首次實作新增 workspace、空資料庫 schema 與版本化 migration，保留現有 guidelines 與已完成的 add-justfile change。更新 justfile/README 描述目前可執行狀態。沒有既有應用資料需要轉換；日後 migration 在啟動時驗證版本並於失敗時退出，不靜默清空資料。回退程式前先保留 SQLite 檔及伴隨 WAL 狀態；重建開發資料需由使用者另行決定，不包含自動刪除 recipe。

## References

- [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [AI SDK OpenAI-compatible provider](https://ai-sdk.dev/providers/openai-compatible-providers)
- [AI SDK cancellation and settings](https://ai-sdk.dev/docs/ai-sdk-core/settings)
- [Vite environment variable exposure](https://vite.dev/guide/env-and-mode)

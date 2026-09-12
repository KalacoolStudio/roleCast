# Role Cast

本機瀏覽器中的多角色文字演練。選擇內建防詐／面試劇本，或建立自己的 plot，與 Persona 對話，結束後查看逐字稿及附有證據引用的回饋報告。

Mastermind 在通話間安排角色與任務，Judge 評估使用者回答並可停止本通，Reporter 撰寫最終報告；同一 Persona 可再次回撥。背景見 [guidelines](guidelines)，實作範圍見 [文字 MVP 提案](openspec/changes/role-cast-text-mvp/proposal.md)。

## 快速開始

需要 Node.js **22.12 以上**、npm、[just](https://just.systems/man/en/packages.html) 及 POSIX shell（Linux、macOS 或 WSL）。已驗證環境：Node.js 26.7.0、npm 11.19.0、just 1.58.0。原始碼與工具使用 JavaScript／JSX，不需 Python 或 TypeScript 編譯。

在專案根目錄執行：

```sh
just setup
```

setup 安裝鎖定依賴、準備 `data/`，僅在 `.env` 不存在時從 `.env.example` 建立，不覆寫既有金鑰。

在根目錄 `.env` 填入三個必填欄位：

```dotenv
LLM_API_KEY=填入你的金鑰
LLM_BASE_URL=填入供應商的相容 API 基礎網址
LLM_MODEL=填入供應商的模型 ID
PORT=3000
DATABASE_PATH=./data/role-cast.sqlite
```

使用 **OpenAI-compatible Chat Completions** 端點。基礎網址應包含供應商要求的版本路徑（例如 `/v1`），不要包含 `/chat/completions`；adapter 會補上該路徑。模型需能依提示輸出 JSON。本程式不要求原生 JSON schema 模式，也不保證相容各供應商的私有 API。程序環境變數優先於 `.env`。

```sh
just dev
```

開啟 **http://127.0.0.1:5173**。前端代理 `/api` 至後端（預設 3000）。前端修改後自動更新；修改後端或 `.env` 後，按 **Ctrl-C** 停止前後端，再執行 `just dev`。任一子程序失敗時也會停止另一個服務。

## 操作指令

執行 `just` 或 `just --list` 查看 [justfile](justfile) 的指令與用途。

| 指令              | 用途                                           |
| ----------------- | ---------------------------------------------- |
| `just setup`      | 安裝依賴、準備環境，保留既有 `.env`            |
| `just dev`        | 啟動開發前後端；使用 5173 網址                 |
| `just test-setup` | 安裝 Playwright Chromium，首次瀏覽器測試前執行 |
| `just test`       | 建置後執行單元、整合與瀏覽器測試               |
| `just check`      | JavaScript lint 與格式檢查                     |
| `just build`      | 建置正式介面                                   |
| `just start`      | 啟動已建置的介面與 API；使用 3000 網址         |
| `just tunnel`     | 使用 ngrok 分享正式介面與 API，讀取設定的 PORT |
| `just status`     | 檢查服務/資料庫健康；未啟動時返回非零狀態      |

正式本機模式：

```sh
just build
just start
```

開啟 **http://127.0.0.1:3000**（或設定的 PORT）。此 MVP 預設在本機使用，沒有帳號與遠端部署功能。

### 使用 ngrok 分享

先依 [ngrok 官方指南](https://ngrok.com/docs/start) 安裝 `ngrok` 並設定 authtoken（不是 xAI 的 `grok` CLI）：

```sh
ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN
just build
just start
```

保持服務執行，在另一個終端執行：

```sh
just tunnel
```

開啟 ngrok 顯示的 HTTPS 網址即可使用介面及 API。指令讀取 `.env` 的 `PORT`（預設 3000），程序環境變數優先；它不會自動啟動應用程式。按 Ctrl-C 關閉 tunnel，本機服務繼續執行。

此介面沒有登入驗證，取得公開網址的人可以存取劇本與演練紀錄，並啟動會使用模型額度的演練；僅在需要分享時開啟 tunnel。

## 劇本工作室：Plot 與 Drill

**Plot 是可重用的劇本；Drill 是使用該劇本進行的一次演練。** 一個 plot 可以產生多個各自獨立的 drill。

1. 左側開啟「劇本工作室」，按「新增劇本」，或複製內建防詐／面試劇本。
2. 填寫名稱、簡介、目標、固定事實、評估判準、停止條件與回合上限。固定事實的 ID／名稱和判準 ID 必須唯一；至少一項判準。
3. 分別編輯三個角色的 prompts：

| 欄位                 | 用途                                   |
| -------------------- | -------------------------------------- |
| `prompts.mastermind` | 通話間安排角色、任務與整場進度         |
| `prompts.judge`      | 通話中的 Watch，以及結束後的 Recap     |
| `prompts.reporter`   | 依證據整理最終報告，設定回饋重點與語氣 |

4. 按「儲存劇本」，再按「使用此劇本」回到開始畫面建立 drill。每次儲存增加 plot 版本；如果其他分頁已更新，系統保留草稿並提示重新載入。
5. 可「匯出 JSON」保存或分享定義；「匯入 JSON」先開啟草稿，儲存時建立新 plot，不覆寫原劇本。範例：[客服溝通 plot](examples/customer-support.plot.json)。

自訂 prompts 是角色指引；輸出 JSON、有效引用與固定事實規則仍由系統檢查。Persona 的基本對話 prompt 由系統管理，Mastermind 透過人設與任務讓不同 plot 有不同對話風格。

每個 prompt 最多 12,000 字元，固定事實及判準各最多 30 項，JSON 檔案／儲存請求最多 256 KB。JSON 格式為 `{ "formatVersion": 1, "plot": { ... } }`；不含 plot ID、版本或 drill 紀錄。編輯器欄位與匯入使用相同驗證規則。

Plot 定義保存在 SQLite。內建 JSON 僅於資料庫缺少對應 ID 時載入，之後請透過工作室修改。**開始 drill 時會保存 plot 版本與實際 prompts；編輯劇本不會改寫現有 drill。**

## 演練流程

1. 選擇 plot，可選填背景後開始新 drill；一次只允許一場進行中的演練。
2. 下一位角色準備好後按「接通對話」，等待開場，再輸入回覆。
3. Persona 與 Judge 同時處理回合；Judge 允許繼續後才顯示完整回覆。等待期間仍可掛斷或結束整場。
4. 每通結束後整理回顧，可能由同一位或另一位角色來電；也可直接結束整場。
5. 查看最終報告，點擊證據文字對照原訊息。歷史列表保留已完成、失敗及中斷的演練。

每個 plot 可設定 1–3 通，每通 1–12 個使用者回合。背景最多 2,000 字，單則訊息最多 4,000 字。每次模型操作最多 30 秒、最多 2 次嘗試；驗證失敗會明確停止演練，保留已有紀錄。

## 資料與金鑰

`.env` 僅由後端讀取，金鑰不送至瀏覽器、不寫入資料庫或日誌。`.env` 與 `data/` 已由 Git 忽略；請勿在 `VITE_` 開頭的設定放入秘密。

逐字稿、角色與報告保存在本機 SQLite，**推論所需對話與背景會送至你設定的外部 LLM API**。這不是離線模型；資料保存方式也受供應商政策影響。防詐操作都是文字情境，沒有真實轉帳或電話連線。

瀏覽器重新整理會還原同一場。後端重新啟動時，未結束演練標為「已中斷」並保留已接受訊息，不自動重送請求、續接舊通話或補造報告。請開始新演練。不要同時啟動兩個後端使用同一資料庫。

## API 與既有資料

- `GET /api/plots`：公開劇本列表；`GET /api/plots/:id`：供本機作者編輯的完整定義。
- `POST /api/plots`：建立定義；`PUT /api/plots/:id`：提交完整定義及目前 `version`，成功回傳新版本；過期版本回傳 409。
- `POST /api/drills`：`{ "plotId": "...", "background": "..." }`；`GET /api/drills` 與 `/api/drills/:id`：歷史與演練快照。
- 通話操作：`POST /api/drills/:id/calls/accept`、`/calls/:callId/messages`、`/calls/:callId/hangup`、`/finish`；報告：`GET /api/drills/:id/report`。
- 舊 `/api/scenarios`、`/api/sessions` 仍接受舊欄位並回傳相容投影。Drill API 不含私有 prompts 或固定事實，作者 API 會提供完整 plot；這是單一本機工作空間，沒有作者／受測者帳號隔離。

首次啟動會將 SQLite 從 v1 升級至 v2，保留舊 ID、逐字稿、報告與保存的 operation prompts。升級前可在停止後端後備份整個 `data/`；若需回退舊程式，請還原升級前備份。舊版程式無法直接開啟 v2 資料庫。

## 驗證與故障排除

```sh
just test-setup
just test
just check
```

測試使用暫存 SQLite、受控 Agent 與本機 HTTP provider stub，不讀取真實 key、不呼叫付費模型 API。Playwright 服務使用 3100 port，測試前請確保它可用。Chromium 若缺少系統函式庫，請依 [Playwright 系統需求](https://playwright.dev/docs/intro#system-requirements) 安裝相應套件。SQLite binding 使用預編譯套件；若所選 Node/平台沒有對應套件，請使用支援的 Node 版本。

- 「請檢查設定」：修正列出的 `.env` 欄位後重新啟動。
- 「模型 API 驗證失敗」：確認金鑰與端點屬於同一服務。
- 「模型 API 不接受此請求」：確認模型 ID、Chat Completions 協定與 base URL 路徑。
- 「模型回應未通過格式或證據驗證」：可換用更能遵循 JSON 與引用規則的模型。
- 連接埠衝突：停止佔用程式或設定後端 PORT；開發前端固定使用 5173。

### 真實模型 smoke checklist

自動化測試證明流程及資料契約，不代表真實模型品質。配置自己的 API 後，可人工檢查：

- 內建及自訂 plot 是否能以繁體中文開場及自然追問。
- 各 plot 的 Mastermind／Judge／Reporter 指引是否反映在對應行為，編輯後的新 drill 是否使用新版本。
- 同角色回撥是否延續自身記憶，且未改變身分或固定事實。
- 明確質疑詐騙並提出官方查證時是否合理停止；單純「好」不應當成已達標。
- 面試評語是否反映實際回答，引用是否對照原文。
- 結束整場或失敗後是否保留紀錄，且沒有遲到回覆。

請記錄供應商、模型、通過項目與失敗例子；模型本身的語意判斷仍可能出錯。

# Role Cast

本機瀏覽器中的多角色文字與語音演練。選擇內建防詐／面試劇本，或建立自己的 plot，與 Persona 對話，結束後查看逐字稿及附有證據引用的回饋報告。

Mastermind 在通話間安排角色與任務，Judge 評估使用者回答並可停止本通，Reporter 撰寫最終報告；同一 Persona 可再次回撥。背景見 [guidelines](guidelines)，目前行為見 [OpenSpec 規格索引](openspec/README.md)。

## 快速開始

需要 Node.js **22.12 以上**、npm、[just](https://just.systems/man/en/packages.html) 及 POSIX shell（Linux、macOS 或 WSL）。已驗證環境：Node.js 26.7.0、npm 11.19.0、just 1.58.0。原始碼與工具使用 JavaScript／JSX，不需 Python 或 TypeScript 編譯。

在專案根目錄執行：

```sh
just setup
```

setup 安裝鎖定依賴、準備 `data/`，僅在 `.env` 不存在時從 `.env.example` 建立，不覆寫既有金鑰。

在根目錄 `.env` 填入三個必填欄位：

```dotenv
API_KEY=填入你的_OpenAI_金鑰
LLM_BASE_URL=填入供應商的相容 API 基礎網址
LLM_MODEL=填入供應商的模型 ID
LLM_OUTPUT_MODE=auto
PORT=3000
DATABASE_PATH=./data/role-cast.sqlite
```

使用 **OpenAI-compatible Chat Completions** 端點。基礎網址應包含供應商要求的版本路徑（例如 `/v1`），不要包含 `/chat/completions`；adapter 會補上該路徑。程序環境變數優先於 `.env`。

`LLM_OUTPUT_MODE` 預設為 `auto`：官方 `api.openai.com` 使用嚴格 JSON Schema，其他端點使用 JSON object 模式。可指定 `json_schema`（模型需支援 Structured Outputs）、`json_object`（僅保證 JSON 語法）或 `text`（供不支援 JSON 模式的相容端點使用）。所有模式都會在後端驗證欄位、型別與證據引用；不符合的結果不會進入演練狀態。不保證相容供應商的私有 API。

`API_KEY` 同時供文字 Agent 與 GPT Live 使用，不需另外設定語音金鑰。舊有僅文字設定仍支援 `LLM_API_KEY`；兩者都有時，以 `API_KEY` 為準。`LLM_BASE_URL` 與 `LLM_MODEL` 繼續設定文字推論。

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

自訂 prompts 只設定角色行為、評估重點與語氣，不能重新定義輸出欄位。固定 system instruction、輸出 schema 與允許引用的 ID 由程式產生；自訂指引與對話放在較低優先權的輸入資料中。Persona 的基本對話 prompt 由系統管理，Mastermind 透過人設與任務讓不同 plot 有不同對話風格。

例如自訂 Judge prompt 提到 `shouldStop`／`confidence`，系統仍要求既有 `stop` 與證據欄位；Mastermind 的人設限制放入既有 personality、任務放入 goal，不新增 capabilities 或 assignment 欄位。驗證失敗時，系統提供錯誤類別與欄位位置，最多重試一次。每次輸出預算 4,000 tokens，只有截斷時重試提高至 8,000；嚴格格式仍不能取代對證據內容的判斷。

每個 prompt 最多 12,000 字元，固定事實及判準各最多 30 項，JSON 檔案／儲存請求最多 256 KB。JSON 格式為 `{ "formatVersion": 1, "plot": { ... } }`；不含 plot ID、版本或 drill 紀錄。編輯器欄位與匯入使用相同驗證規則。

Plot 定義保存在 SQLite。內建 JSON 僅於資料庫缺少對應 ID 時載入，之後請透過工作室修改。**開始 drill 時會保存 plot 版本與實際 prompts；編輯劇本不會改寫現有 drill。**

## 演練流程

1. 選擇 plot，可選填背景後開始新 drill；一次只允許一場進行中的演練。
2. 下一位角色準備好後按「接通對話」，等待開場，再輸入回覆。
3. Persona 與 Judge 同時處理回合；Judge 允許繼續後才顯示完整回覆。等待期間仍可掛斷或結束整場。
4. 每通結束後整理回顧，可能由同一位或另一位角色來電；也可直接結束整場。
5. 查看最終報告，點擊證據文字對照原訊息。歷史列表保留已完成、失敗及中斷的演練。

每個 plot 可設定 1–3 通，每通 1–12 個使用者回合。背景最多 2,000 字，單則訊息最多 4,000 字。每次模型操作最多 30 秒、最多 2 次嘗試；驗證失敗會明確停止演練，保留已有紀錄。

## Drill 即時舞台

使用原本的 `just dev` 啟動後，開始或開啟一場演練，即可在對話旁看到舞台；不需額外啟動動畫服務。

- 老闆 Mastermind 思考並指派角色；職員 Persona 從入口走入通話區，按「接通對話」才開始聊天。
- 秘書 Judge 前往監看。收線後職員離場、秘書回到老闆旁，回顧完成才顯示「回報已交付」，接著安排下一輪。
- 同一 Persona 再次上場保留外觀，標示「再次上場」。角色外觀是舞台識別，姓名及身分以本次劇本產生的角色為準。
- 「掛斷本通」可繼續下一輪；「結束整場演練」停止新進場，完成必要回顧後由 Reporter 整理總回饋。
- 舞台動畫不延遲通話控制。後端處理很快時，過場會縮短追上進度；工作泡泡只顯示狀態，不公開內部推理或私有評語。
- 手機採上下排列，輸入時收合舞台並保留角色狀態；可勾選「減少動畫」，也會遵循系統減少動態效果設定。
- 重新整理或回到背景分頁後，直接還原目前站位，不重播整場。SSE 暫時不可用時顯示「備援連線」並改用輪詢；完全斷線時提示重新連線。

素材位於 `apps/web/public/assets/characters/warm/`，圖格與腳底對齊設定位於 `apps/web/src/stage/sprites.js`。原始 PNG 保留，顯示時裁切影格與混合淺色紙底；目前使用素色區域，未加入辦公室背景。

## GPT Live 模組

獨立的 [`@role-cast/gpt-live`](packages/gpt-live/README.md) 提供 `gpt-live-1` 的 WebSocket 音訊、WebRTC SDP 交換與 sideband 控制。目前介面已透過後端音訊 relay 整合此模組，角色設定及金鑰留在伺服器。

語音直接使用根目錄 `.env` 的既有 `API_KEY`，不需 `OPENAI_API_KEY`。以下兩項可依需要調整：

```dotenv
OPENAI_BASE_URL=https://api.openai.com/v1
LIVE_VOICE=marin
```

`OPENAI_BASE_URL` 和 `LIVE_VOICE` 可省略，預設如上。語音模型固定為 `gpt-live-1`，client delegation，`store: false`。規劃、Judge、角色協助與報告共用 `API_KEY`，仍使用 `LLM_BASE_URL` 和 `LLM_MODEL`。只設定舊有 `LLM_API_KEY` 時可繼續文字演練，語音會停用；無效的選填語音設定也只停用語音。顯示可開啟語音代表本機設定有效，不代表已驗證帳號或模型權限。修改後端或 `.env` 後需重新啟動。

1. 按「用語音接通」，或等文字回覆完成後在「寫下你的回覆…」旁按「開啟語音」。瀏覽器先取得麥克風權限，之後才建立付費模型連線。
2. 開場後直接說話，音訊與逐字稿自動傳送及保存，不需按「送出」。對方說話時也可插話。
3. 「麥克風靜音」暫停收音，對方音訊仍可播放；「改用文字」釋放麥克風並保留同一通對話。等待最後的 Judge 檢查及連線清理完成後即可輸入文字。
4. 「掛斷本通」及「結束整場演練」隨時可用。重新整理或離開頁面會停止語音，返回時須再次手動開啟，不自動續接。

語音模式下 Judge 每秒取得新增逐字片段，逐次檢查累積證據；檢查期間音訊繼續播放，符合停止條件時立即清空後續播放。這與文字模式等待 Judge 後才顯示回覆的時序不同。每通語音累計預設 **180 秒**，靜音及重新開啟語音均不重設時間；語音片段不計入 12 個文字回合上限。內建劇本預設全場最多 3 通；劇本工作室可調整文字回合、通話與每通語音秒數上限，新演練會保存當時設定。

逐字片段可能不完整或延遲，生成文字不代表使用者已聽完整句。歷史標示辨識／播放不確定性；「檢視評估引用片段」與報告引用可查看固定的原始評估文字。往上捲動閱讀時，新字幕不會強制跳回最下方。

語音需要支援 AudioWorklet 的瀏覽器及 localhost（或安全來源）。若權限被拒絕、裝置不可用、音訊暫停、模型連線中斷或音訊緩衝超限，介面會說明原因並提供文字回覆或手動重開語音。建議使用耳機。開發代理同時支援 HTTP 與 WebSocket。

未安裝 just 時可執行 `npm run dev`；正式模式用 `npm run build` 後執行 `npm start`。自動驗證用 `npm run build`、`npm test` 及 `npm run check`。

## 資料與金鑰

`.env` 僅由後端讀取，金鑰不送至瀏覽器、不寫入資料庫或日誌。`.env` 與 `data/` 已由 Git 忽略；請勿在 `VITE_` 開頭的設定放入秘密。

逐字稿、角色與報告保存在本機 SQLite，**推論所需對話與背景會送至你設定的外部 LLM API**。這不是離線模型；資料保存方式也受供應商政策影響。語音音訊會送往 OpenAI Live；本機保存逐字片段與證據，不保存原始音訊，且預設關閉供應商錄製（`store: false`）。防詐操作是模擬情境，沒有真實轉帳或撥打電話。

瀏覽器重新整理會還原同一場。後端重新啟動時，未結束演練標為「已中斷」並保留已接受訊息，不自動重送請求、續接舊通話或補造報告。請開始新演練。不要同時啟動兩個後端使用同一資料庫。

## API 與既有資料

- `GET /api/plots`：公開劇本列表；`GET /api/plots/:id`：供本機作者編輯的完整定義。
- `POST /api/plots`：建立定義；`PUT /api/plots/:id`：提交完整定義及目前 `version`，成功回傳新版本；過期版本回傳 409。
- `POST /api/drills`：`{ "plotId": "...", "background": "..." }`；`GET /api/drills` 與 `/api/drills/:id`：歷史與演練快照。
- 通話操作：`POST /api/drills/:id/calls/accept`、`/calls/:callId/messages`、`/calls/:callId/hangup`、`/finish`；報告：`GET /api/drills/:id/report`。
- 語音：接通可指定 `{ "assignmentId": "...", "mode": "voice" }`；`POST /api/drills/:id/calls/:callId/voice` 保留連線，WebSocket `/api/drills/:id/calls/:callId/voice/:voiceId` 以一次性 token 附加。舊 sessions 路徑亦支援相同操作。
- `GET /api/drills/:id` 的 `stage` 含公開 revision、事件 watermark 與 Persona 外觀映射；原回應欄位保留。
- `GET /api/drills/:id/events?after=0&limit=100`：有序公開事件，limit 上限 500，回傳 nextCursor／hasMore／latestSequence；非法游標 400、超前游標 409、未知 drill 404。
- `GET /api/drills/:id/events/stream?after=N`：SSE 的 stage 事件含 sequence 作為 id，snapshot 訊息提供公開快照；重新連線的 Last-Event-ID 優先。先讀快照、再從 watermark 訂閱可避免重播歷史。
- 舊 `/api/scenarios`、`/api/sessions` 仍接受舊欄位並回傳相容投影。Drill API 不含私有 prompts 或固定事實，作者 API 會提供完整 plot；這是單一本機工作空間，沒有作者／受測者帳號隔離。

首次啟動會將 SQLite 升級至 **v4**，同時支援劇本、舞台與語音證據。可從文字 v1、劇本 v2、舞台 v3，以及語音分支曾使用的 v2 升級；遷移會辨識既有資料表並在同一交易內完成，保留舊 ID、逐字稿、報告、已編輯劇本、operation prompts、事件順序與語音片段。舊紀錄不補造歷史事件；服務重啟會封存待處理的語音文字，並將進行中的 drill 標為中斷且只保存一次中斷事件。

升級前先停止後端並備份整個 `data/`（若自訂 DATABASE_PATH，備份該資料庫與相關檔案）。若需回退舊程式，請停止服務後還原升級前備份；舊程式不能直接開啟 v4，也不能只改小 user_version。回復備份會失去備份之後新增的紀錄。

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
- 「模型回應未通過格式或證據驗證」：訊息會標示角色階段與原因，例如 `SCHEMA`（欄位／型別）、`EVIDENCE_ID`（引用不存在的訊息）或 `STOP_EVIDENCE`（停止判斷缺少證據／判準）。先確認自訂指引只描述行為與評估目標；若持續失敗，可換用更能遵循指令與引用規則的模型。
- 「模型回應超過長度上限」：已提高預算重試仍被截斷，請精簡角色指引中的輸出要求。
- 「模型 API 不接受此請求」：檢查模型是否支援目前的 `LLM_OUTPUT_MODE`；相容端點可依供應商能力設定 `json_object` 或 `text`，修改後重啟 `just dev`。
- 連接埠衝突：停止佔用程式或設定後端 PORT；開發前端固定使用 5173。

### 舞台與 tunnel 驗證

`just test` 包含離線事件排序、原子保存／遷移、SSE 補接／慢連線清理、動畫取消、桌面／手機、重新整理與備援同步案例；瀏覽器截圖存於 `test-results/`。

以既有 `just build` → `just start` → 另一終端 `just tunnel` 流程開啟分享網址後，可檢查：

1. 開始 drill，舞台下方顯示「即時同步」；Network 中 `events/stream` 回應是 text/event-stream，持續接收事件或心跳。
2. 接通、送出及掛斷仍使用同一網址，無來源拒絕；短暫切斷串流後能以備援同步接續，不重複通話。
3. 重新整理恢復目前站位，結束整場後看到報告及「紀錄已保存」。

離線測試不建立公開 tunnel，也不呼叫真實付費模型；透過分享網址實際開始演練會使用所配置的模型。

### 真實模型 smoke checklist

語音自動化涵蓋 24/44.1/48 kHz 合成音訊、實際 AudioWorklet、回環 WebSocket／Vite 代理、權限失敗、靜音、同時收放音、模式切換、停止、報告引用及資料庫遷移／復原。這些測試沒有驗證真實麥克風或付費 Live 帳號。

語音人工檢查項目：確認帳號可建立 `gpt-live-1`；用實際麥克風說繁體中文並核對辨識；在對方說話時插話；比較耳機與喇叭回音；觀察開場／回覆延遲、口音與音量；確認切換文字、失去網路及掛斷後裝置指示燈關閉；核對部分逐字稿與報告引用。請另記錄裝置、瀏覽器、網路、使用秒數與失敗情形。

自動化測試證明流程及資料契約，不代表真實模型品質。配置自己的 API 後，可人工檢查：

- 內建及自訂 plot 是否能以繁體中文開場及自然追問。
- 各 plot 的 Mastermind／Judge／Reporter 指引是否反映在對應行為，編輯後的新 drill 是否使用新版本。
- 同角色回撥是否延續自身記憶，且未改變身分或固定事實。
- 明確質疑詐騙並提出官方查證時是否合理停止；單純「好」不應當成已達標。
- 面試評語是否反映實際回答，引用是否對照原文。
- 結束整場或失敗後是否保留紀錄，且沒有遲到回覆。

請記錄供應商、模型、通過項目與失敗例子；模型本身的語意判斷仍可能出錯。

# local-runtime Specification

## Purpose

定義文字及語音演練的本機執行方式、外部模型設定、資料持續保存及可重現驗證要求，讓使用者能以 JavaScript 工具鏈與 just 指令啟動系統，並清楚掌握金鑰與演練資料的使用邊界。

## Requirements

### Requirement: Configurable server side model access
應用程式與專案工具 SHALL 使用 JavaScript，不要求 Python 或 TypeScript 編譯。後端 SHALL 從根目錄 `.env` 或程序環境讀取 `API_KEY`、`LLM_BASE_URL` 與 `LLM_MODEL`，同一變數由程序環境優先；`API_KEY` 缺少或空白時 SHALL 接受 `LLM_API_KEY` 作為文字模式的相容設定。Live SHALL 僅使用共用的 `API_KEY`，不讀取 `OPENAI_API_KEY`，選填的 `OPENAI_BASE_URL` 與 `LIVE_VOICE` 僅影響語音。文字 Agent SHALL 支援可設定的 OpenAI-compatible Chat API 端點，且模型須能依提示回傳可驗證的 JSON。文字模型選擇 SHALL 不需改動程式碼。`LLM_OUTPUT_MODE` SHALL 可選 auto、json_schema、json_object 或 text，以調整端點輸出格式相容性，但所有模式均須保留本機結構及證據驗證。

#### Scenario: Configure an endpoint
- **WHEN** 使用者設定有效端點、模型與金鑰並啟動服務
- **THEN** Mastermind、Judge、Persona 文字回覆／協助與 Reporter 的模型請求均由後端送往該文字端點；啟用語音時，其音訊連線使用獨立的 Live 端點

#### Scenario: Missing configuration
- **WHEN** 必填模型設定缺少或格式無效
- **THEN** 啟動檢查列出缺少或無效的設定名稱並以失敗退出，不顯示設定中的秘密值

### Requirement: Secret isolation and clear data handling
API 金鑰 SHALL 只在後端使用，不進入瀏覽器資產、API 回應、資料庫或日誌。專案 SHALL 提供不含真實金鑰的 `.env.example`，忽略實際 `.env` 與本機資料目錄；setup SHALL 不覆寫既有 `.env`。README 與開始演練介面 SHALL 依執行模式說明紀錄保存位置：本機模式保存在本機；GCP 模式保存在雲端持久磁碟並與其他瀏覽器工作區隔離。兩種模式 SHALL 說明推論內容送至設定的外部 API，不宣稱離線或資料完全不出機。

#### Scenario: Existing key file
- **WHEN** 使用者已有 `.env` 並重跑 setup
- **THEN** 原檔內容不變，專案不將其納入版本控制

#### Scenario: Provider authentication error
- **WHEN** 模型 API 回傳驗證錯誤
- **THEN** 使用者看到經整理的錯誤種類，回應與日誌均不含 API key 或原始授權標頭

#### Scenario: Storage disclosure follows deployment mode
- **WHEN** 使用者在本機或 GCP 模式開啟開始演練介面
- **THEN** 介面顯示該模式的保存位置與工作區隔離範圍，並保留外部模型推論提示

### Requirement: Durable local records
系統 SHALL 在本機保存劇本定義、演練快照、角色、指派、已接受訊息、結束原因、Judge 結果、舞台事件、語音逐字證據及最終報告。已確認接受的訊息 SHALL 在程序重啟後仍可讀取。程序重啟時尚未終止的演練 SHALL 標為中斷並保持可讀，不自動重送模型請求或宣稱續接成功。舊版文字、劇本、舞台或語音資料庫 SHALL 以單一交易遷移至相容的合併結構，失敗時不留下半完成遷移；既有 ID、提示、逐字稿、報告及事件順序不得遺失。

#### Scenario: Process restarts mid call
- **WHEN** 程序在通話期間停止並重新啟動
- **THEN** 舊演練顯示中斷與既有紀錄，使用者可開始新演練，不自動接續舊通話

### Requirement: Browser workspace isolation
系統 SHALL 為每個瀏覽器建立不可猜測且禁止 JavaScript 讀取的持久工作區憑證。後端 SHALL 依工作區限制劇本、演練、報告、舞台事件與語音操作；知道其他工作區的資源 ID 不得授予讀取或修改權限。每個工作區 SHALL 有自己的內建劇本副本與進行中演練限制。既有未分區資料升級時 SHALL 完整歸入第一個接手的工作區，不得遺失。

#### Scenario: Concurrent independent users
- **WHEN** 兩個沒有共用 Cookie 的瀏覽器同時建立及操作演練
- **THEN** 兩者各自看到自己的劇本、歷史與 active drill，且其中一方不能讀取、掛斷或結束另一方的演練

#### Scenario: Resume browser workspace
- **WHEN** 同一瀏覽器帶著既有工作區 Cookie 再次開啟服務
- **THEN** 系統恢復該工作區資料，且不在 API 或前端 JavaScript 中揭露工作區憑證

### Requirement: Bounded failures and validated model results
所有模型請求 SHALL 有逾時及有限次重試。格式錯誤、無效角色 ID、無效證據引用或矛盾固定事實 SHALL 在更新狀態前被拒絕。無法完成的規劃、回合、回顧或報告 SHALL 將演練標為失敗並保留已保存資料；不得以假回覆或假報告替代。已取消的通話請求 SHALL 不被重試。

#### Scenario: Invalid model response
- **WHEN** 模型輸出不符合必要欄位且重試後仍無效
- **THEN** 演練顯示失敗與可理解的原因，無效結果不成為正式角色、訊息、回顧或報告

#### Scenario: Cancelled generation
- **WHEN** 使用者或 Judge 結束通話後原模型工作回傳錯誤或結果
- **THEN** 系統丟棄該工作的後續結果，不重試或覆寫已完成的終止狀態

### Requirement: Discoverable and executable project commands
專案 SHALL 提供 `just` 與 `just --list` 列出具用途註解的實際 recipes，以及 `just setup`、`just dev`、`just test`、`just check`、`just build`、`just start`、`just status`。README SHALL 說明先決條件、`.env` 設定、瀏覽器網址及 Ctrl-C 停止方式。測試與建置 SHALL 不要求真實金鑰或呼叫付費模型 API。

#### Scenario: Fresh checkout
- **WHEN** 使用者依 README 安裝先決條件、執行 setup、填入 `.env` 並執行 dev
- **THEN** 前後端啟動且可從文件列出的本機網址開始演練，Ctrl-C 可停止兩者

#### Scenario: Offline automated validation
- **WHEN** 未設定真實金鑰時執行 test、check 及 build
- **THEN** 驗證以受控模型替身完成，且不產生外部 LLM 請求

#### Scenario: Production start
- **WHEN** 使用者完成 build 並填入有效 `.env` 後執行 start
- **THEN** 本機服務提供建置後的介面與 API，status 能反映服務健康狀態


### Requirement: Fixed operation output contracts

Agent outputs SHALL use the application's fixed structured envelope and operation schema. Author guidance SHALL remain subordinate to the system contract and MUST NOT add arbitrary output fields or weaken identity, fact, criterion, or evidence validation. Voice assistance SHALL permit an empty context string while retaining its size bound.

#### Scenario: Author requests another output shape
- **WHEN** a custom role prompt asks for fields outside the operation schema or invents evidence references
- **THEN** the result is rejected before updating persisted state, and bounded repair receives validation feedback without reflecting private provider output

#### Scenario: Explicit endpoint compatibility mode
- **WHEN** the configured text endpoint uses JSON-object or plain-text output mode
- **THEN** the same local schema and evidence checks apply before the operation can succeed

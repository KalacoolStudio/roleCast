## Purpose

定義文字 MVP 的本機執行方式、外部模型設定、資料持續保存及可重現驗證要求，讓使用者能以 JavaScript 工具鏈與 just 指令啟動系統，並清楚掌握金鑰與演練資料的使用邊界。

## ADDED Requirements

### Requirement: Configurable server side model access
應用程式與專案工具 SHALL 使用 JavaScript，不要求 Python 或 TypeScript 編譯。後端 SHALL 從根目錄 `.env` 或程序環境讀取 `LLM_API_KEY`、`LLM_BASE_URL` 與 `LLM_MODEL`，由程序環境優先。第一版 SHALL 支援可設定的 OpenAI-compatible Chat API 端點，且模型須能依提示回傳可驗證的 JSON。模型選擇 SHALL 不需改動程式碼。

#### Scenario: Configure an endpoint
- **WHEN** 使用者設定有效端點、模型與金鑰並啟動服務
- **THEN** 三種角色的模型請求均由後端送往該設定端點

#### Scenario: Missing configuration
- **WHEN** 必填模型設定缺少或格式無效
- **THEN** 啟動檢查列出缺少或無效的設定名稱並以失敗退出，不顯示設定中的秘密值

### Requirement: Secret isolation and clear data handling
API 金鑰 SHALL 只在後端使用，不進入瀏覽器資產、API 回應、資料庫或日誌。專案 SHALL 提供不含真實金鑰的 `.env.example`，忽略實際 `.env` 與本機資料目錄；setup SHALL 不覆寫既有 `.env`。README 與開始演練介面 SHALL 說明紀錄保存在本機，但推論內容送至設定的外部 API，不宣稱離線或資料完全不出機。

#### Scenario: Existing key file
- **WHEN** 使用者已有 `.env` 並重跑 setup
- **THEN** 原檔內容不變，專案不將其納入版本控制

#### Scenario: Provider authentication error
- **WHEN** 模型 API 回傳驗證錯誤
- **THEN** 使用者看到經整理的錯誤種類，回應與日誌均不含 API key 或原始授權標頭

### Requirement: Durable local records
系統 SHALL 在本機保存演練快照、角色、指派、已接受訊息、結束原因、Judge 結果及最終報告。已確認接受的訊息 SHALL 在程序重啟後仍可讀取。程序重啟時尚未終止的演練 SHALL 標為中斷並保持可讀，不自動重送模型請求或宣稱續接成功。

#### Scenario: Process restarts mid call
- **WHEN** 程序在通話期間停止並重新啟動
- **THEN** 舊演練顯示中斷與既有紀錄，使用者可開始新演練，不自動接續舊通話

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

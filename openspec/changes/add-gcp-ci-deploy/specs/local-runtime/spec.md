## MODIFIED Requirements

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

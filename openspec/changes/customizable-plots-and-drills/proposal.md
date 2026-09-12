## Why

使用者需要自行擴充劇本，而目前兩個情境與所有 prompts 寫死於程式。以 plot 表示可重用劇本、drill 表示單次演練，並讓報告由獨立 Reporter 負責。

## What Changes

- 新增本機 plot 管理：新增、複製、編輯、JSON 匯入／匯出，保存於 SQLite。
- 每個 plot 分別設定 Mastermind、Judge、Reporter prompts；保留 Persona 的通話與記憶邊界。
- 新 drill 保存 plot 版本與實際 prompts 快照，後續編輯不影響現有 drill。
- 介面與主要 API 使用 plot/drill 詞彙，保留舊 API 相容入口與既有紀錄。

## Capabilities

### New Capabilities

- `plot-authoring`: 自訂劇本、角色 prompts、演練快照與既有資料相容。

### Modified Capabilities

無已同步的 main specs；本 change 接續已實作的 role-cast-text-mvp，Reporter 取代其 Mastermind 最終報告職責。

## Impact

Core 契約與角色輸入、SQLite migration、HTTP API、React UI、測試、README 和 guidelines。保持全 JavaScript 與現有 LLM API 設定，不增加套件。

## Why

Role Cast 已有三種 Agent 的分工指南，但沒有可操作的演練程式。先建立能完成多輪文字演練並產出報告的 MVP，驗證角色重用、客觀評估與通話生命週期，再擴充語音。

## What Changes

- 建立本機瀏覽器操作的文字版：選擇情境、開始演練、與 Persona 對話、掛斷本通、繼續下一通、結束演練與查看歷史報告。
- 以全 JavaScript 實作。Mastermind 在通話間建立或重用角色並指派任務；Judge 逐次評估使用者訊息、可停止當前通話，通話後提供 Recap；Mastermind 依據累積證據產出總報告。
- 保存角色名冊、任務、逐字稿、評估與報告至本機 SQLite。單機單使用者，一次一場進行中的演練；提供防詐與模擬面試兩個內建文字情境作為通用流程的驗證案例。
- 串接外部 LLM API，後端從根目錄 `.env` 讀取金鑰、端點與模型設定。第一版採可設定端點的 OpenAI-compatible Chat API adapter；不假設所有供應商的私有 API 均可直接使用。
- 擴充現有 `justfile` 與 README，提供實際 setup、dev、test、check、build、start 操作與 API 設定說明。
- 說明資料保存在本機，但推論所需內容會送往設定的 API 服務。這是使用者已確認的外部推論安排，不能沿用 guidelines 中「不會外洩」作為全面保證。

## Capabilities

### New Capabilities

- `simulation-lifecycle`: 情境、演練與通話狀態、Mastermind 決策、Persona 名冊與一致的背景事實。
- `evaluation-reporting`: Judge Watch、StopCall、Recap 與具備逐字稿證據的最終報告。
- `text-training-ui`: 瀏覽器文字互動、狀態同步、通話控制與歷史結果查看。
- `local-runtime`: JavaScript 執行環境、LLM API 設定、本機保存、失敗處理與 just 操作入口。

### Modified Capabilities

無。現有 OpenSpec 尚無產品 specs；已完成的 `add-justfile` 僅提供工具入口。

## Impact

預計新增 npm workspace、Node.js/Fastify 後端、React/Vite 前端、AI SDK adapter、SQLite schema、情境定義與自動化測試。更新 `justfile`、README，新增不含真實金鑰的 `.env.example` 與忽略規則。

本次不包含語音、真實電話、多人帳號、雲端部署、情境編輯器或程序重啟後自動續接通話。技術套件為本提案的設計選擇；JavaScript、外部 LLM API、`.env` 與 just 操作入口為已確認需求。

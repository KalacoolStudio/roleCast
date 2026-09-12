# drill-stage-events Specification

## Purpose

提供與保存的演練狀態一致、依序且可補接的公開舞台事件，讓前端在即時更新、快速交接、重連與重啟時準確呈現角色工作流程，同時維持既有通話 API、歷史資料及私有模型資料的邊界。

## Requirements

### Requirement: Ordered committed lifecycle events

系統 SHALL 保存 drill 範圍內具有單調遞增 sequence 的公開事件，涵蓋規劃、建立／重用指派、通話開始、回合處理、通話結束、回顧開始／完成、報告開始與完成／失敗／中斷。事件 SHALL 僅在對應狀態成功保存後可讀取，時間戳不得替代排序編號。

#### Scenario: Normal handoff order
- **WHEN** 本通結束且回顧成功，Mastermind 繼續安排下一通
- **THEN** 對外可依序取得 call_ended、recap_started、recap_completed、planning_started 及 persona_assigned，即使多個步驟在一次前端輪詢間完成

#### Scenario: Duplicate request or obsolete model job
- **WHEN** accept、send 或 hangup 被重送，或被取消的模型工作較晚完成
- **THEN** 系統沿用既有冪等行為，不建立重複的生命週期事件或與目前狀態矛盾的事件

#### Scenario: Failed state transaction
- **WHEN** 儲存狀態與事件的操作失敗
- **THEN** 讀取者不得看見只有事件但沒有對應保存狀態，或只有該次状态但漏掉應有事件的半完成結果

### Requirement: Versioned public snapshots

公開 drill 快照 SHALL 帶有舞台 schemaVersion、公開 revision、事件 watermark 與穩定 Persona 外觀映射。revision SHALL 隨公開狀態更新遞增；快照與 watermark SHALL 一致，讓 client 可由快照位置開始追蹤未來事件。私有模型資料 SHALL 不因舞台中繼資料而對外公開。

#### Scenario: Snapshot then subscription
- **WHEN** client 先讀取快照，接著從其 watermark 訂閱
- **THEN** 可取得快照之後的全部公開舞台事件，不需要重播快照之前的演出，也不遺漏兩次請求之間發生的事件

#### Scenario: Older response arrives late
- **WHEN** client 已處理較新 revision 後收到較舊的快照
- **THEN** client 不回退狀態、當前 Persona 或可操作的通話

### Requirement: Paginated event access

系統 SHALL 提供 GET /api/drills/:id/events，以 after 游標與有上限的 limit 取得嚴格依 sequence 排序的事件，並回傳下一個游標、是否仍有資料及最新 sequence。未知 drill SHALL 回 404；非法游標或限制 SHALL 回 400；超前於最新事件的游標 SHALL 回 409，允許 client 重新讀取快照。

#### Scenario: Reconnect across multiple pages
- **WHEN** 連線中斷期間發生的事件數量超過單頁上限
- **THEN** client 可逐頁取得缺少的事件並追上最新狀態，不依賴一次傳回全部歷史

#### Scenario: Invalid or future cursor
- **WHEN** client 使用負數、非整數或超前於該 drill 最新 sequence 的游標
- **THEN** API 依游標錯誤類型回傳 400 或 409，不靜默跳過未讀事件

### Requirement: Resumable live event stream

系統 SHALL 提供 GET /api/drills/:id/events/stream 的 SSE，支援 after 及重新連線的 Last-Event-ID，先補接再持續提供已保存事件與最新公開快照。Last-Event-ID 存在且有效時 SHALL 優先於 after。傳輸允許重複交付，client SHALL 依 sequence 去重並處理缺口。串流 SHALL 有心跳、有界緩衝及斷線資源清理。

#### Scenario: Events during catch-up
- **WHEN** 補接歷史事件時又產生新事件
- **THEN** client 最終依序收到兩者，沒有從補接轉到即時模式的遺漏區間

#### Scenario: Duplicate delivery on reconnect
- **WHEN** 串流在交付後中斷而重送最後一筆事件
- **THEN** client 不重複進場、交付或新增活動紀錄，並可繼續接收後續事件

#### Scenario: Unavailable stream
- **WHEN** SSE 無法建立或持續中斷
- **THEN** client 顯示連線狀態並以快照與事件查詢補接；恢復 SSE 後停止重複輪詢，不額外呼叫模型

#### Scenario: Slow or closed client
- **WHEN** client 消費速度低於產生速度、關閉頁面或伺服器關閉
- **THEN** 伺服器限制緩衝、必要時中止並允許補接，且釋放相關訂閱及計時資源

### Requirement: Public event payload boundary

事件及新增舞台欄位 SHALL 僅包含該 drill 的公開識別碼、順序、版本、時間、狀態、角色摘要、建立／重用標示、外觀鍵及公開結束原因；串流快照可包含既有參與者可見逐字稿、劇本摘要及總報告。系統 SHALL 不直接序列化 prompts、Allowed Facts、assignment 私有內容、watch／recap 私有內容、模型推理、API key 或原始供應商錯誤。

#### Scenario: Private marker isolation
- **WHEN** 劇本 prompts、隱藏事實與 Judge 回顧含可識別的私有測試文字
- **THEN** 該文字不出現在公開 stage 快照、事件查詢及 SSE 的生命週期資料中

#### Scenario: Drill isolation
- **WHEN** client 訂閱或補接指定 drill 的事件
- **THEN** 傳回的事件與快照均屬於該 drill，不混入另一場演練

### Requirement: Migration and existing client compatibility

加入事件功能 SHALL 保留既有 plot、drill、Persona、通話、逐字稿、報告及 REST／legacy API 行為。歷史資料 SHALL 不被補造為有精確時間的過往事件；服務重啟 SHALL 維持將未完成演練標記 interrupted 的行為並保存該次中斷事件，不自動重跑模型。

#### Scenario: Upgrade existing database
- **WHEN** 舊資料庫升級後開啟已完成及未完成 drill
- **THEN** 已完成紀錄與報告保留，未完成 drill 以 interrupted 呈現並僅保存一次該次中斷，沒有額外模型呼叫

#### Scenario: Legacy REST caller
- **WHEN** 既有 client 使用 sessions 或 drills routes 完成接通、送出、掛斷與查詢報告
- **THEN** 既有回應欄位與冪等語意仍可使用，不要求 client 必須訂閱舞台事件

## Context

目前 Engine 將靜態 scenario 與五個 operation prompts 存入 session；Store 使用 sessions 等 SQL tables，user_version=1。report operation 目前標為 Mastermind。參見 proposal.md。

## Goals / Non-Goals

Goals: 本機作者能透過網頁維護 plot；同一 plot 支援多個獨立 drill；保存所有現有資料及非同步生命週期保障。
Non-Goals: 多人帳號、公開分享服務、刪除紀錄、任意程式或模板執行、逐角色模型設定。

## Decisions

- SQLite 增加 plots table 與 version=2 migration。保留既有 SQL table/column 名稱以避免不必要的外鍵重建，將儲存 payload 的 scenario 正規化為 plot。既有 operation prompts 原樣保留。
- 兩個內建 plot 僅在缺少該 ID 時 seed，不覆寫使用者修改。plot 有 ID、版本、公開介紹、目標、facts、criteria、stopCondition、通話/回合上限、prompts.mastermind/judge/reporter。嚴格驗證非空與長度、集合大小、唯一 fact ID/key 與 criterion ID。
- 建立 drill 時 snapshot 完整 plot 並組合每個 operation 的系統契約與 plot prompt。plan→mastermind、watch/recap→judge、report→reporter；Persona 不接收上述 prompts。角色 context 排除其他角色 prompts；Reporter 僅取得目標、判準、逐字稿和 Recap。
- 新 API /api/plots（公開列表）、/api/plots/:id（作者完整定義）、POST plots、PUT plots/:id（版本比對），以及 /api/drills 全套生命週期。旧 /api/scenarios 和 /api/sessions 以相容投影映射；新客戶端使用 canonical 欄位。
- 作者 API 本機同源控制沿用現有部署模型。drill/public plot endpoints 不返回私有 prompts。沒有多使用者權限隔離的承諾。
- 網頁編輯器提供基本欄位、facts/criteria 列表與三個 prompts 欄位。複製及匯入先建立未保存草稿；匯出格式 {formatVersion:1,plot:<definition>} 不含 ID/version 或演練紀錄。儲存才新增 plot；更新版本衝突為 409，保留草稿讓使用者重新載入。

## Risks / Trade-offs

- 作者 prompt 可能造成模型輸出失敗 → 固定 JSON 契約及證據驗證持續生效，不能用自訂 prompt 關閉驗證。
- 多分頁覆寫 → optimistic version check，衝突保留編輯內容。
- 舊版程式不認得 version=2 → 部署前可備份 SQLite；回退需還原備份，不能直接以舊程式開啟新 DB。
- 模型品質非 deterministic → 測試驗證 prompts 路由、隔離與快照，另提供人工真實模型檢查流程。

## Migration Plan

啟動時單一交易升級 schema 和舊 payload，保持 ID、關聯與逐字稿。正常恢復流程仍將未完成 drill 標為 interrupted。新 built-in prompts 只用於新 drill，已保存的 prompts 不重算。

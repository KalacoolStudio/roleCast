## Context

動機與範圍見 proposal.md。已讀取現有 engine、store、Fastify routes、前端輪詢與相關測試：

- Engine 已有 planning、awaiting_call、in_call、recapping、reporting 與 terminal states；Mastermind 僅在通話間決策，Judge watch 與 Persona reply 在使用者回合並行。
- 前端在可見頁面每 500ms 取得快照，背景分頁為 2500ms；短暫 recapping/planning 可能整段被略過。
- Engine 的 version 是非同步工作失效控制，並非每次儲存都增加，不可直接用作 UI 更新序號。
- SQLite schema 為 v2，資料保留 sessions/session_id 名稱；Store.save 使用 transaction，程序重啟會把未完成 drill 標記 interrupted。
- 公開 view 僅提供參與者可見資料。既有 REST、legacy sessions routes、訊息去重與單一 active drill 均需維持。
- 5 張角色圖集為 1536×1024、4 欄×2 列，站立在上排、移動在下排。素材有底色與姿態對齊問題，不能假設每格有相同腳底位置或已透明。
- 工作區另有 app.js 與 runtime.test.js 的未提交來源檢查修正；實作需保留並整合，不回退這些內容。

## Goals / Non-Goals

**Goals:**

- 以可還原的公開事件驅動展示，維持快照、操作及畫面的因果一致性。
- 以獨立舞台座標與圖集設定支援未來換背景；以 fixture 驗證動作，不需要付費模型呼叫。
- 限制動畫與連線資源，長時間等待、分頁切換、事件過快及 SSE 中斷皆可收斂至最新狀態。

**Non-Goals:**

- 不把像素座標、步行時間或動畫完成回呼納入 engine 決策；不增加模型操作種類或額外模型請求。
- 不把內部 payload、推理或 Judge 評語放入事件，也不建立完整事件溯源的業務引擎。功能排除項見 proposal.md。

## Decisions

### 1. 素色 DOM 舞台與固定路徑

沿用 React／JSX，新增 DrillStage、CharacterSprite、stage-layout 與舞台控制模組；外層 transform 處理移動，內層圖格循環處理走路，名稱與泡泡不隨朝向鏡像。採相對座標、角色腳底為定位點及依 Y 座標排列遮擋層級。

固定入口、候場、Mastermind、回報、通話、Judge 監看與待命錨點，路徑用少量轉折點避開角色。Mastermind 留在工作位；Judge 在監看／回報／待命位間往返；Persona 從入口進場、結束後沿路離場。同時最多三位角色。

桌面約 65:35 舞台／對話，窄螢幕上下排列；手機輸入時縮小舞台。完整文字在原對話區，舞台僅放短狀態，不把大段逐字稿放成遮擋場景的泡泡。Reporter 使用狀態卡與原報告區。

替代方案：Canvas／遊戲引擎適合自由移動世界，但本次固定三角色情境用 DOM 較容易整合現有操作與無障礙。背景場景或尋路增加時再評估。

### 2. 素材設定與穩定 Persona 外觀

新增集中素材 manifest，定義來源、圖格、裁切、scale、每格腳底 offset、待機與移動影格。預設使用上排單格待機與下排四格循環，不假設上排已有明顯逐格動作。動態思考／文件提示由 UI 畫出。角色位置實際改變時才播放 manifest 的步行序列（每格 120ms），以同一段移動時間設定 CSS transition 與播放生命週期，抵達切回待機；左右朝向依 X 座標變化決定。排程縮短過場時同步縮短位移時間，還原與減少動畫直接定位。

mastermind.png 對應老闆、judge.png 對應秘書；新 Persona 按該 drill 的建立順序循環選 persona-01/02/03，將 spriteKey 與 Persona ID 的映射持久化為舞台中繼資料。重用保持相同映射，名稱始終可見；超過三個角色可共享外觀但不可共享 ID。舊紀錄以保存的 persona 順序推導相同映射。

已檢查背景與每格位置，採逐格裁切、腳底 offset、顯示時亮度調整與 multiply 混合去除淺色紙底，不覆寫來源；圖格先獨立裁切再位移，避免露出鄰排影格。不得以全圖去除淺色像素的方式破壞襯衫與眼白；素材處理需視覺檢查，沿用專案 JavaScript 工具約束。獨立 manifest 避免畫面程式依赖原始命名與尺寸。

### 3. 原子保存公開事件與快照序號

新增 v3 schema 的 drill_stage_events 表（FK 指向 sessions），以 (session_id, sequence) 為主鍵，保存公開型別、時間與白名單 payload。為每個 drill 保存獨立 publicRevision；每次會改變公開 view 或產生舞台事件的交易增加一次，與 engine.version 分開。

Store 在保存邊界比較交易內讀取的前後狀態，以集中白名單投影產生待附加事件；同一交易保存狀態、publicRevision、映射及事件，commit 後才通知訂閱者。事件 sequence 在該交易配置，不使用時間戳排序。模型工作 token 驗證通過後才可提交事件；重送 accept/send、重複 close 或遲到工作均不得新增重複事件。

事件集合：planning_started、persona_assigned（created/reused）、call_started、turn_started、turn_completed、call_ended、recap_started、recap_completed、report_started、drill_completed、drill_failed、drill_interrupted。停止要求由公開快照的 finishRequested 反映；非事件型公開更新仍增加 publicRevision 並通知快照訂閱者。

事件欄位限制為 sequence、revision、drillId、type、occurredAt，以及按型別定義的 callId、assignmentId、persona 摘要／spriteKey、messageId、公開 endReason。不得直接 spread 模型輸出、assignment、watch、recap 或 prompts。turn_completed 僅在本回合的公開回覆成功提交時發出；Judge 停止時直接發 call_ended。

recap_completed 必須在 recap 已保存後出現，之後才能有 planning_started 或 report_started。recap_started 表示整理中，動畫可讓 Judge 邊走邊整理，但文件交付僅由 recap_completed 觸發。Mastermind 的思考提示對應真實 planning，不展示內部推理。

替代方案：只比較最新 state 最簡單，但無法還原快切換；把所有舊事件放在每次快照會無限重傳。本設計使用小型事件表及有界查詢，保留既有資料模型。

### 4. 快照、SSE 與補接協定

- GET /api/drills/:id 保留原欄位，新增 stage：schemaVersion、revision、lastEventSequence、personas（公開摘要與 spriteKey）、currentAssignment（公開 assignmentId、personaId、created/reused）。重用標示依保存的指派順序還原，不依 client 曾看過的事件猜測。view 與 watermark 在一致的資料庫讀取中取得。
- GET /api/drills/:id/events?after=N&limit=M 回傳 after 之後的有序 events、nextCursor、hasMore 與 latestSequence；limit 預設 100、上限 500，游標為非負整數。非法參數回 400，未知 drill 回 404，超出最新值的游標回 409 並要求重新取快照。
- GET /api/drills/:id/events/stream?after=N 使用 SSE。stage 事件的 id 是 sequence；重新連線有效 Last-Event-ID 優先於 after。snapshot 訊息無 id，攜帶公開 view 與 revision／watermark。每個交付批次先送有序 stage events，再送對應的最新 snapshot。
- 初始載入先取得快照並定位，接著從其 watermark 訂閱，避免重播既有整場事件。SSE 先補完缺少事件，再接即時事件，使用訂閱前後 watermark 檢查避免補接與訂閱之間漏件。
- 斷線期間的 SSE 補接可重複交付，client 按 sequence 去重；快照按 revision 拒絕過期資料。需要重建連線時以 client 已接收 sequence 為 after；亂序／缺口觸發補接，而不是猜測事件。
- 每 15 秒送 heartbeat，使用 text/event-stream、no-cache/no-transform 及停用代理緩衝提示。斷線、切換 drill、終止狀態與 app 關閉都清除 timer／listener。慢 client 以有界緩衝及 write backpressure 處理，超限斷開並讓其補接，不無限累積記憶體。
- SSE 失敗時保留現有輪詢作 fallback，同時用事件讀取 API 分頁補接；SSE 恢復後停用重複輪詢。沒有網路時顯示連線狀態，不自行推進演練。

第一版所有 HTTP 控制仍用既有 REST；新增 SSE 不擴張來源允許規則。替代方案 WebSocket 需要額外双向協定，但 client 控制已有 REST，SSE 已足夠。

### 5. 可取消的動畫排程

client 分開保存 authoritative snapshot、已接收 cursor 與 animation queue；snapshot 決定輸入／按鈕，queue 決定短暫視覺演出。每個 queue item 帶 drillId、sequence、callId／assignmentId，切換 drill 即取消所有舊項目。動畫回呼不得觸發業務 API。

正常動線：planning 思考 → persona_assigned 入口到候場再到通話區 → 等待使用者接通 → call_started 對話與 Judge 就位 → call_ended Persona 離場、Judge 前往回報位 → recap_completed 文件交付 → planning_started 再思考，或 report_started 顯示報告狀態。

預設每段移動 0.6–1.2 秒、交付提示 0.4 秒。佇列累計預估超过 3 秒時縮短或合併動作，保留事件紀錄但盡快定位到最新狀態；不強迫演出完整歷史。使用者提早接通時直接完成必要定位；掛斷、finishRequested、failed／interrupted 等狀態立即停用不合時宜的說話／新角色進場，不受動畫等待影響。

in_call 時 Persona 的回覆提示依 busy／turn 事件切換；Judge 顯示「監看中」，不從共用 busy 假裝推算 Judge 個別模型呼叫完成時間。缺少事件的舊 drill 依快照顯示靜態位置；terminal 歷史不播放舊動畫。

prefers-reduced-motion 與頁面「減少動畫」控制會直接定位並保留狀態文字。背景分頁停止影格與移動，回到前景取得最新快照後直接收斂，不補播整段。區域有文字標籤、角色有名稱、狀態有節制的 aria-live；操作可只用鍵盤完成。

替代方案：讓後端等待角色走到定點容易拖慢模型與卡住通話，因此動畫僅為投影；純 CSS 根據 state 切換則難處理取消、補接與快切換，故加入可獨立測試的排程器。

## Risks / Trade-offs

- 圖集留白與底色造成走動抖動或矩形塊 → 先用全部影格做視覺檢查，調整腳底錨點與必要的衍生素材。
- SSE 代理緩衝或中斷 → heartbeat、補接、snapshot watermark、輪詢 fallback；正式 build 與現有 tunnel 流程需驗證事件及控制可共用來源。
- Engine 多處 save 遺漏 revision／事件 → 將公開狀態提交集中在保存邊界，用完整生命週期、重試及取消測試覆蓋。
- 動畫落後使人誤解真實階段 → 上方狀態與操作始終取 authoritative snapshot，過場設定 3 秒追趕上限與即時取消。
- 事件公開過多影響演練 → 嚴格白名單與帶私有 marker 的測試，UI 僅呈現工作提示。
- 新表隨演練累積 → 分頁與查詢索引、有界傳輸；第一版不另建事件清理功能，保留與現有 drill 歷史相同生命週期。

## Migration Plan

1. 依現有方式停止服務並備份 SQLite；在 transaction 中由 v2 升 v3，新增事件表與舞台中繼資料，保留既有 IDs、plot 快照、逐字稿與報告。
2. 舊 drill 初始化 revision／watermark，按 persona 保存順序建立外觀映射；不捏造舊時間點的生命週期事件。recover 對 active drill 保存 interrupted 狀態及單一新事件，保持不重啟模型工作的行為。
3. 部署具新 API 的後端與前端，保留 REST 與 legacy 相容性。沒有 stage 中繼資料的舊服務快照以靜態／文字降級，避免白畫面。
4. 使用離線 fixtures 執行 just check、just test；以 just dev 或 just build / just start 驗證素材與串流。測試覆蓋 v1→v3 及 v2→v3，並調整既有 schema version 斷言。
5. 舊程式會拒絕較新 schema；回退需停止服務並還原遷移前備份，不能只把 user_version 改小。恢復備份會失去備份之後的資料，操作說明需明示。

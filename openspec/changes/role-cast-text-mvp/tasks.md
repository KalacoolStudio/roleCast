## 1. JavaScript 基礎與設定

- [x] 1.1 建立 Node.js ESM npm workspace、Fastify server、React/Vite web 與共用 packages，鎖定依賴及 Node engines；以 npm ci 與前端 build 驗證乾淨安裝可用，且專案原始碼/工具無 Python 或 TypeScript 編譯需求。
- [x] 1.2 建立後端 `.env` 設定驗證、`.env.example`、忽略規則及 secrets-safe error mapping；驗證環境優先序、缺漏/無效設定失敗退出、測試不載入真實金鑰，並以 sentinel key 檢查錯誤與日誌不洩漏。
- [x] 1.3 設定 Vitest、ESLint、格式檢查與 Playwright 的 JavaScript 設定；以最小測試及前端 smoke 驗證工具可執行，模型 fixture 僅由測試入口注入。

## 2. 資料契約、情境與保存

- [x] 2.1 定義情境、角色、指派、訊息、Watch、Recap、report 的 schema 與核心驗證，建立防詐/模擬面試兩個靜態情境；以測試驗證必要欄位、字數/回合/通話上限、無效角色與證據 ID、固定事實矛盾及未知事實不自動加入名冊。
- [x] 2.2 實作 SQLite migrations 與 repositories，保存情境/角色快照、指派、通話、訊息、評估與報告；以暫存資料庫測試外鍵、active session 唯一、訊息冪等、逐字稿順序及每通 Recap/每場 report 唯一性。
- [x] 2.3 實作啟動恢復檢查與歷史讀取；用重開資料庫/重啟 server 測試證明非終止演練轉為 interrupted、既有訊息保留且無模型自動續跑，已終止演練不被改寫。

## 3. 模型與三種角色

- [x] 3.1 實作可設定 base URL、模型與金鑰的 AI SDK Chat adapter、JSON 解析、有限修復、30 秒逾時與總計最多兩次嘗試；以本機 provider stub 驗證成功、401/429/5xx、無效 JSON、AbortSignal、錯誤整理及取消不重試。
- [x] 3.2 實作 Mastermind 規劃/報告與 Persona 開場/回覆的 prompts、schema 和 context 組裝；以受控結果測試新角色、同 ID 回撥、個別記憶、事實來源、只在通話間規劃及報告的有效引用/證據不足。
- [x] 3.3 實作 Judge Watch 與 Recap，使用固定情境判準及雙方逐字稿；測試明確達標、模糊回答、無效引用及回顧內容契約，並驗證 Judge context 不含 Mastermind 私有推理或編劇任務。

## 4. 演練與通話控制

- [x] 4.1 實作 planning、awaiting_call、in_call、recapping、reporting 與各終止狀態的轉移；測試建立/重用/finish 決策、接通開場、單通單身分、回合與通話上限及 active session 衝突。
- [x] 4.2 實作訊息先保存、單回合限制、Persona/Watch 並行與 Watch continue 後發布完整回覆；以可控制順序的 promises 測試雙方先後完成、StopCall 取消及遲到回覆不發布/不落成已送出訊息。
- [x] 4.3 實作冪等掛斷、Persona requestHangup、finishRequested 與 generationVersion 檢查；測試所有非終止階段的手動結束、重複/舊 StopCall、只排一次 Recap/report、舊錯誤不影響後續狀態。
- [x] 4.4 串接規劃、回合、回顧及報告的失敗終止處理；以模型故障注入驗證保留已接受紀錄、取消未完成工作、無假結果與無誤啟動下一通。

## 5. HTTP API 與參與者介面

- [x] 5.1 建立 design.md API 表列 routes、輸入限制與 public projections；以 API 整合測試驗證 400/404/409/202、訊息 ID 同內容重送/不同內容衝突、接通冪等、私有 Agent 資料與 key 不出現在 payload。
- [x] 5.2 建立繁體中文情境選擇與文字通話介面，含資料流向說明、背景欄位、接通、處理狀態、掛斷及結束；以瀏覽器測試驗證兩個情境入口、鍵盤操作、忙碌時禁止重複送出且停止控制可用。
- [x] 5.3 建立快照輪詢、刷新還原與連線錯誤恢復；以 browser/API 測試驗證回覆中刷新不重送、訊息順序一致、斷線重取狀態及通話結束後輸入禁用。
- [x] 5.4 建立歷史列表、分通逐字稿與報告引用對照；以瀏覽器測試驗證 completed/failed/interrupted 顯示、證據不足與查歷史不觸發模型請求。

## 6. 操作入口與整體驗收

- [x] 6.1 擴充 justfile 的 setup/dev/test/check/build/start/status 與 JavaScript supervisor，保留預設 list；實際執行各 recipe，驗證 setup 重跑不覆寫 `.env`、dev 子程序失敗/Ctrl-C 均清理服務、build/start 靜態介面可用及 status 正確反映健康。
- [x] 6.2 更新 README 說明已驗證 Node 版本、依賴與 Playwright 安裝、API 協定和三個 LLM 設定、本機網址、資料流向、停止/重啟行為與真實模型 smoke checklist；照文件在隔離環境重走流程，驗證所有命令與連結。
- [x] 6.3 執行整合驗收：使用受控模型走防詐 StopCall、面試多通換角及同角色回撥到最終報告，再驗證重啟可讀；執行 just test/check/build、檢查 client bundle/log/DB 無 sentinel key，記錄自動化結果並明確區分真實供應商 smoke 是否已執行。

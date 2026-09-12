## 1. Plot and drill domain

- [x] 1.1 建立嚴格 plot/JSON 匯入契約與內建劇本，驗證缺欄位、大小上限及重複 ID/key 會拒絕。
- [x] 1.2 實作 plots repository、版本衝突及 v1 資料遷移，測試重啟保留、seed 不覆寫及舊 drill ID/逐字稿/prompts 保留。
- [x] 1.3 核心使用 drill/plot 詞彙及快照，分離 Reporter，測試三種 prompt 路由、角色隔離、編輯不影響現有 drill 和原有生命週期。

## 2. API and authoring UI

- [x] 2.1 新增 plots/drills APIs 與舊 routes 相容，測試 CRUD、驗證、409、公開投影與新舊演練操作。
- [x] 2.2 建立網頁新增／複製／編輯與匯入匯出，測試儲存後可選取、獨立 prompts、JSON round trip、錯誤保留草稿與手機畫面。

## 3. Integration and documentation

- [x] 3.1 更新 README、guidelines 角色分工與 plot/drill 使用說明，提供匯入範例並驗證文件連結與範例格式。
- [x] 3.2 執行 just test/check/build 與 OpenSpec strict validation，記錄結果及真實模型測試範圍。

## MODIFIED Requirements

### Requirement: Public event payload boundary

事件及新增舞台欄位 SHALL 僅包含該 drill 的公開識別碼、順序、版本、時間、狀態、角色摘要、建立／重用標示、外觀鍵及公開結束原因；串流快照可包含既有參與者可見逐字稿、劇本摘要及總報告。系統 SHALL 不直接序列化 prompts、assignment 任務或共享訊息清單、watch／recap 私有內容、模型推理、API key 或原始供應商錯誤。

#### Scenario: Private marker isolation
- **WHEN** 劇本 prompts、assignment 任務與 Judge 回顧含可識別的私有測試文字
- **THEN** 該文字不出現在公開 stage 快照、事件查詢及 SSE 的生命週期資料中

#### Scenario: Drill isolation
- **WHEN** client 訂閱或補接指定 drill 的事件
- **THEN** 傳回的事件與快照均屬於該 drill，不混入另一場演練

## MODIFIED Requirements

### Requirement: Participant oriented interface
介面 SHALL 提供情境選擇、選填背景、演練狀態、當前角色、依序排列的語音逐字稿及靜音、掛斷與結束控制。介面 SHALL NOT 提供文字回覆欄位或送出文字操作。通話中 SHALL 只將 Persona 呈現為對話角色；Mastermind 指令與任務、明確共享訊息清單、Judge 私有觀察及 API 設定不得作為聊天內容送至受測者。介面 SHALL 使用繁體中文。

#### Scenario: Start and accept call
- **WHEN** 使用者開始演練，Mastermind 完成第一通指派
- **THEN** 介面顯示待接通角色；使用者明確按下語音接通並授權麥克風後才啟動 Persona 語音開場

#### Scenario: Private agent information
- **WHEN** 使用者接收演練狀態或通話更新
- **THEN** 回應僅包含參與者可見資料，不包含內部提示、私有回顧或金鑰

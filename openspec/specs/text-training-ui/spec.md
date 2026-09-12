# text-training-ui Specification

## Purpose

提供本機使用者可完成整場文字演練的瀏覽器介面，讓情境選擇、單一角色對話、掛斷、通話切換與報告查看都有清楚狀態，並在重新整理或網路短暫中斷時保持與伺服器保存的紀錄一致。

## Requirements

### Requirement: Participant oriented interface
介面 SHALL 提供情境選擇、選填背景、演練狀態、當前角色、依序排列的文字訊息及掛斷與結束控制。通話中 SHALL 只將 Persona 呈現為對話角色；Mastermind 指令、Allowed Facts 內部清單、Judge 私有觀察及 API 設定不得作為聊天內容送至受測者。介面 SHALL 使用繁體中文作為預設文字。

#### Scenario: Start and accept call
- **WHEN** 使用者開始演練，Mastermind 完成第一通指派
- **THEN** 介面顯示待接通角色；使用者接通後才啟動 Persona 開場及文字輸入

#### Scenario: Private agent information
- **WHEN** 使用者接收演練狀態或通話更新
- **THEN** 回應僅包含參與者可見資料，不包含內部提示、私有回顧或金鑰

### Requirement: Ordered text turns and explicit progress
介面 SHALL 以完整訊息顯示 Persona 回覆，並顯示規劃、回覆中、回顧中、待接通及報告產生中的狀態。前一個使用者回合尚未完成時 SHALL 防止再次提交文字，但掛斷與結束控制保持可用。通話結束後 SHALL 禁用該通輸入。

#### Scenario: Waiting for response
- **WHEN** 使用者送出有效文字而回合仍在處理
- **THEN** 介面顯示已接受的使用者訊息及處理狀態，不插入假 Persona 回覆或接受第二個新回合

#### Scenario: Judge terminates call
- **WHEN** 本通因 Judge 判定而結束
- **THEN** 介面顯示通話已結束，不再插入該通未送出的回覆，並顯示回顧或下一步狀態

### Requirement: Refresh and duplicate submission safety
系統 SHALL 在頁面重新整理後還原伺服器的最新狀態與已保存訊息。重送相同訊息識別碼 SHALL 不造成重複紀錄或重複模型請求；同一識別碼搭配不同內容 SHALL 被拒絕。連線失敗 SHALL 顯示可理解的錯誤並提供重新取得狀態的操作。

#### Scenario: Refresh during generation
- **WHEN** 伺服器仍運作且使用者在 Persona 回覆中重新整理
- **THEN** 頁面重新顯示同一場與同一通，不重新送出已接受訊息或另開一場

#### Scenario: Retried message
- **WHEN** 使用者因回應遺失而重送同一訊息識別碼與內容
- **THEN** 系統回傳既有接受結果，不再新增訊息或啟動第二次回合

### Requirement: Historical transcripts and reports
使用者 SHALL 能列出過往演練，查看情境、時間、終止狀態、按通話分組的逐字稿及已產出的報告。失敗或被程序重啟中斷的演練 SHALL 可查看既有紀錄並明確區分於正常完成。

#### Scenario: View an earlier report
- **WHEN** 使用者開啟已完成演練
- **THEN** 顯示保存的逐字稿與報告，不重新呼叫 LLM 生成內容

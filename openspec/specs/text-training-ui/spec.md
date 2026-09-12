# text-training-ui Specification

## Purpose

提供本機使用者可完成整場語音演練的瀏覽器介面，讓情境選擇、語音接通、逐字稿、掛斷、通話切換與報告查看都有清楚狀態，並在重新整理或網路短暫中斷時保持與伺服器保存的紀錄一致。

## Requirements

### Requirement: Participant oriented interface
介面 SHALL 提供情境選擇、選填背景、演練狀態、當前角色、依序排列的語音逐字稿及靜音、掛斷與結束控制。介面 SHALL NOT 提供文字回覆欄位或送出文字操作。通話中 SHALL 只將 Persona 呈現為對話角色；Mastermind 指令、Allowed Facts 內部清單、Judge 私有觀察及 API 設定不得作為聊天內容送至受測者。介面 SHALL 使用繁體中文。

#### Scenario: Start and accept call
- **WHEN** 使用者開始演練，Mastermind 完成第一通指派
- **THEN** 介面顯示待接通角色；使用者明確按下語音接通並授權麥克風後才啟動 Persona 語音開場

#### Scenario: Private agent information
- **WHEN** 使用者接收演練狀態或通話更新
- **THEN** 回應僅包含參與者可見資料，不包含內部提示、私有回顧或金鑰

### Requirement: Ordered voice captions and explicit progress
介面 SHALL 依序顯示雙方語音逐字稿，並顯示規劃、連線、收音、播放、回顧中、待接通及報告產生中的狀態。語音字幕 SHALL 自動更新而不需送出操作；掛斷與結束控制在模型工作期間保持可用。通話結束後 SHALL 停止該通收音與播放。

#### Scenario: Live spoken response
- **WHEN** 使用者說話且逐字片段持續抵達
- **THEN** 介面更新同一段語音字幕與處理狀態，不插入假 Persona 回覆或要求文字提交

#### Scenario: Judge terminates call
- **WHEN** 本通因 Judge 判定而結束
- **THEN** 介面顯示通話已結束，不再插入該通未送出的回覆，並顯示回顧或下一步狀態

### Requirement: Refresh and retry safety
系統 SHALL 在頁面重新整理後還原伺服器的最新狀態與已保存逐字稿，但 SHALL NOT 自動重新取得麥克風或建立付費語音連線。連線失敗 SHALL 顯示可理解的錯誤並提供手動重新開啟語音及重新取得狀態的操作。

#### Scenario: Refresh during voice
- **WHEN** 伺服器仍運作且使用者在 Persona 語音回覆中重新整理
- **THEN** 頁面重新顯示同一場、同一通與已保存逐字稿，不自行開啟麥克風、另開一場或重播開場

### Requirement: Historical transcripts and reports
使用者 SHALL 能列出過往演練，查看情境、時間、終止狀態、按通話分組的逐字稿及已產出的報告。失敗或被程序重啟中斷的演練 SHALL 可查看既有紀錄並明確區分於正常完成。

#### Scenario: View an earlier report
- **WHEN** 使用者開啟已完成演練
- **THEN** 顯示保存的逐字稿與報告，不重新呼叫 LLM 生成內容

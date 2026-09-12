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

### Requirement: Consistent prototype visual identity

介面 SHALL 使用參考原型的 RoleCast 字標與四柱標誌、橘色重點色、暖白與米色底色、深色文字及圓角面板。首頁、共用導覽、演練、報告與劇本工作室 SHALL 維持一致的字體與控制項風格，同時保留各頁既有操作與狀態辨識。

#### Scenario: Navigate between styled views
- **WHEN** 使用者在首頁、劇本工作室及演練紀錄之間切換
- **THEN** 各頁沿用一致的品牌、配色與控制項樣式，仍可選擇劇本、編輯劇本及查看逐字稿與報告

### Requirement: Illustrated plot selection

首頁 SHALL 顯示品牌介紹、情境插圖、劇本選擇、選填背景及開始演練控制。選擇劇本 SHALL 更新預覽名稱、分類、簡介、插圖與練習重點；內建防詐及面試劇本 SHALL 各有對應插圖，其他劇本 SHALL 使用通用辦公室插圖及通用練習重點。插圖 SHALL 隨專案提供，不依賴原型來源目錄或外部圖片服務。預覽 SHALL 僅呈現練習主題，不作為實際角色指派、接通或進度的依據。

#### Scenario: Select a built-in plot
- **WHEN** 使用者在防詐與面試劇本之間切換
- **THEN** 預覽顯示所選劇本的公開資訊、對應情境插圖與練習重點，且不因選擇或顯示插圖而建立演練或發送模型請求

#### Scenario: Select a custom plot
- **WHEN** 使用者選擇已建立或匯入的自訂劇本
- **THEN** 預覽顯示該劇本的公開資訊與通用辦公室插圖，不要求使用者提供新圖片，仍可填寫背景並開始該劇本

#### Scenario: Start or resume deliberately
- **WHEN** 使用者查看開始演練區
- **THEN** 僅在已選擇有效劇本、未處理開始操作且沒有進行中的演練時允許開始；已有進行中的演練時提供繼續該場的操作，並保留本機保存與外部 API 推論的資料使用說明

### Requirement: Responsive and accessible scenario home

首頁 SHALL 在寬螢幕並排呈現情境預覽與劇本選擇，在窄螢幕上下排列。介面 SHALL 在 320px 至 1440px 的檢查寬度保持無水平溢出，並保留可操作的劇本、背景、開始及歷史紀錄控制。劇本選擇 SHALL 可使用鍵盤操作並暴露選取狀態；輸入 SHALL 有文字標籤，插圖 SHALL 有替代文字，裝飾性標誌 SHALL 不重複朗讀品牌名稱。

#### Scenario: Narrow-screen home and history
- **WHEN** 使用者於 390px 寬手機開啟首頁並展開或收合演練紀錄
- **THEN** 預覽與選擇區上下排列，歷史紀錄可讀取，開始演練控制可操作，頁面不產生水平溢出

#### Scenario: Keyboard scenario selection
- **WHEN** 使用者以鍵盤聚焦並啟用劇本選擇或開始控制
- **THEN** 顯示可見焦點，所選劇本的狀態可辨識，背景欄位與開始操作不依賴滑鼠或插圖互動

### Requirement: Prepared anti-fraud marketplace introduction

使用者在首頁選擇內建「防詐警覺演練」並按開始時，介面 SHALL 先顯示參考原型的情境示範聊天室。第一則訊息 SHALL 為「您好，耳機還在嗎？配件都有嗎？」；後續 SHALL 包含預設回覆、下單與結帳失敗訊息、可放大的失敗訂單示意及客服聯絡卡。介面 SHALL 顯示 Lin 與耳機商品的本機圖片，並清楚標示這是預先編排的示範對話。示範內容 SHALL 不保存為使用者逐字稿、不計入評分且不作為後續演練的固定事實。

#### Scenario: Begin the marketplace example
- **WHEN** 使用者選擇內建防詐劇本並按「開始演練」
- **THEN** 顯示情境示範聊天室與指定的第一則訊息，後續訊息依序出現，不建立真實 drill 或啟動模型及麥克風

#### Scenario: Replay and inspect the example
- **WHEN** 使用者重播、顯示完整對話或放大訂單示意
- **THEN** 可查看相同且順序固定的內容，放大內容可透過關閉按鈕或 Escape 返回，重播不建立演練或重複儲存訊息

#### Scenario: Continue to the call drill
- **WHEN** 使用者按客服聯絡卡的「申請客服回電」
- **THEN** 系統以所選防詐劇本及先前填寫的背景建立既有通話演練，等待使用者接通；示範訊息不加入逐字稿或模型上下文，開始失敗時保留聊天室並提供重試或繼續既有演練的操作

#### Scenario: Choose independent verification
- **WHEN** 使用者在示範中選擇「自行找官方客服確認」
- **THEN** 顯示該示範選擇的說明與返回聊天室或劇本大廳的操作，不宣稱使用者已經完成查證，不產生能力評分或啟動真實聯絡

#### Scenario: Other plots and existing drills
- **WHEN** 使用者開始面試或自訂劇本，或從紀錄開啟既有 drill
- **THEN** 沿用原先開始或還原流程，不插入防詐示範聊天室；離開未開始通話的示範或重新整理頁面不留下進行中的 drill

#### Scenario: Mobile and reduced-motion example
- **WHEN** 使用者於 390px 手機或減少動態效果模式開啟示範
- **THEN** 頁面無水平溢出且可操作所有選項；減少動態效果時直接顯示完整對話，圖片有替代文字且所有操作支援鍵盤

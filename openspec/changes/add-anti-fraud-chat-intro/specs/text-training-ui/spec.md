## ADDED Requirements

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

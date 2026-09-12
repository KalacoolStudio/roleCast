## ADDED Requirements

### Requirement: Prototype incoming caller screen

每次有待接通的 Persona 時，介面 SHALL 以置中的深藍綠色來電彈出視窗與暗色背景遮罩呈現，不佔用演練頁的排版空間，依參考原型置中排列圓形角色標誌、實際指派的公開姓名與角色、來電狀態及並排的紅色「拒接」與綠色「接聽」按鈕。面試劇本 SHALL 使用橄欖綠 HR 標誌，其他劇本 SHALL 使用由實際姓名產生的標誌，不將原型範例姓名或品牌當作指派身分。彈出視窗 SHALL 在 320px 至 1440px 寬度無水平溢出，於短螢幕可在視窗內捲動、保留長姓名的可讀性、可見鍵盤焦點及至少 44px 高的按鈕。

#### Scenario: Pending built-in or custom caller
- **WHEN** 內建或自訂劇本的第一通或後續通話準備好
- **THEN** 深色彈出視窗顯示該次指派的公開姓名、角色與「來電中…」，顯示兩個操作，且不自行接通或取得麥克風

#### Scenario: Answer and retry
- **WHEN** 使用者按「接聽」
- **THEN** 沿用語音接通流程，先取得麥克風授權再接通，準備期間顯示真實進度並防止重複操作；權限或接通失敗時在彈出視窗內顯示錯誤並保留來電供手動重試，成功後恢復既有通話介面

#### Scenario: Decline the pending call
- **WHEN** 使用者按「拒接」
- **THEN** 系統以既有結束整場流程結束演練，保留先前紀錄並嘗試產出報告，不接受待接通角色、不啟動麥克風或語音模型；尚無對話時報告明示證據不足

#### Scenario: Availability and data disclosure
- **WHEN** 來電等待接聽但語音能力仍在確認或無法使用
- **THEN** 「接聽」停用並顯示對應原因，「拒接」仍可使用；待接通期間保留外部語音傳送、部署保存位置及時間限制說明

#### Scenario: Narrow screen and keyboard
- **WHEN** 使用者於窄螢幕、長姓名或減少動態效果模式操作來電彈出視窗
- **THEN** 姓名與角色換行、按鈕保持可辨識且可透過鍵盤啟用，畫面不溢出，也不依賴動畫或顏色辨識動作

#### Scenario: Dismiss and reopen without changing the call
- **WHEN** 使用者透過關閉按鈕、Escape 或點擊背景遮罩收合來電視窗
- **THEN** 待接通指派保持不變，不發出通話或結束請求；原狀態區的「查看來電」可重新開啟同一通，之後的新指派仍會自動彈出

#### Scenario: Modal keyboard and workspace restoration
- **WHEN** 來電視窗開啟、收合、接通或隨演練狀態移除
- **THEN** 開啟時焦點進入視窗、鍵盤焦點限於視窗內且背景暫不接受操作；收合時恢復背景操作並回到「查看來電」，接通或結束時解除遮罩與捲動鎖定，原舞台與聊天位置及既有捲動位置保持不變

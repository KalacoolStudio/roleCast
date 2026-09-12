## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Stage and conversation workspace

演練頁 SHALL 同時提供角色舞台、當前狀態、Persona 身分、逐字稿及既有通話控制。舞台 SHALL 使用隨專案提供的辦公室插圖背景及可辨識的入口、候場、通話、工作與回報位置，並與共用介面維持一致的暖色面板、文字及重點色；桌面並排顯示舞台與對話，窄螢幕上下排列，且 SHALL 不產生水平溢出或遮蔽通話控制。

#### Scenario: Desktop and mobile exercise
- **WHEN** 使用者於桌面或 390px 寬手機開啟進行中的 drill
- **THEN** 使用者可辨識角色位置與當前狀態，讀取逐字稿並操作語音接通、靜音、掛斷及結束整場；手機上仍可看見角色狀態並操作語音控制

### Requirement: Accessible and legible motion

舞台 SHALL 提供文字標籤與節制的狀態朗讀，角色與動作不得成為理解進度的唯一方式。系統 SHALL 尊重 prefers-reduced-motion 並提供減少動畫控制；此模式直接定位、保留狀態及全部操作。圖格切換 SHALL 保持角色腳底穩定，不裁掉角色或使底色方塊遮擋鄰近角色。

#### Scenario: Reduced motion and keyboard use
- **WHEN** 使用者偏好減少動態效果或啟用減少動畫，並以鍵盤完成演練
- **THEN** 不播放移動與循環步行，仍可辨識角色分工並完成語音接通、靜音、掛斷及查看報告

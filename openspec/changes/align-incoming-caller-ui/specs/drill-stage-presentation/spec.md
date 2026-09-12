## MODIFIED Requirements

### Requirement: Stage and conversation workspace

演練頁 SHALL 同時提供角色舞台、當前狀態、Persona 身分、逐字稿及既有通話控制。舞台 SHALL 使用隨專案提供的辦公室插圖背景及可辨識的入口、候場、通話、工作與回報位置，並與共用介面維持一致的暖色面板、文字及重點色；桌面並排顯示舞台與對話，窄螢幕上下排列，且 SHALL 不產生水平溢出或遮蔽通話控制。待接通時 SHALL 以深色來電彈出視窗覆蓋背景，舞台、對話與既有逐字稿仍保留原先的大小、位置及捲動位置。視窗開啟時背景暫不接受操作；使用者收合視窗後 SHALL 能操作原工作區並從狀態區重新查看來電，接通後 SHALL 移除視窗並沿用原有舞台與通話配置。

#### Scenario: Desktop and mobile exercise
- **WHEN** 使用者於桌面或 390px 寬手機開啟進行中的 drill
- **THEN** 使用者可辨識角色位置與當前狀態，讀取逐字稿並操作語音接通、靜音、掛斷及結束整場；手機上仍可看見角色狀態並操作語音控制

#### Scenario: Incoming call over the workspace
- **WHEN** 第一通或後續通話等待接通
- **THEN** 來電彈出視窗優先呈現角色與接聽／拒接動作，不新增工作區高度、不推移舞台或逐字稿；收合或完成接聽後即可在原位置繼續操作

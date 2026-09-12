# drill-stage-presentation Specification

## Purpose

讓使用者在文字或語音演練中透過角色站位與動作理解 Mastermind、Judge 與 Persona 的分工與交接，並在快速狀態切換、重新整理、行動裝置與減少動畫模式下，維持操作及演練進度的一致性。

## Requirements

### Requirement: Stage and conversation workspace

演練頁 SHALL 同時提供角色舞台、當前狀態、Persona 身分、逐字稿及既有通話控制。舞台 SHALL 使用素色背景及可辨識的入口、候場、通話、工作與回報位置；桌面並排顯示舞台與對話，窄螢幕上下排列，且 SHALL 不產生水平溢出或遮蔽輸入控制。

#### Scenario: Desktop and mobile exercise
- **WHEN** 使用者於桌面或 390px 寬手機開啟進行中的 drill
- **THEN** 使用者可辨識角色位置與當前狀態，讀取逐字稿並操作接通、送出、掛斷及結束整場；手機輸入時仍可看見精簡的角色狀態

### Requirement: Planning and persona arrival

當 Mastermind 規劃時，舞台 SHALL 顯示思考狀態。角色指派成功後 SHALL 顯示對應 Persona 從邊界經候場位置進入通話區；使用者 SHALL 明確接通後才啟動對話。動畫 SHALL 不自行接通或呼叫模型。

#### Scenario: First assignment
- **WHEN** 第一通規劃成功建立 Persona 並等待接通
- **THEN** 舞台顯示老闆指派提示與該 Persona 進場，顯示姓名、角色及接通控制，且不產生未接通的聊天回覆

#### Scenario: Accept before arrival finishes
- **WHEN** 使用者在進場動畫完成前接通
- **THEN** 介面立即提交既有接通操作並完成必要站位，僅啟動一次通話，不等待動畫回呼

### Requirement: Stable character identity

Mastermind SHALL 使用老闆素材，Judge SHALL 使用秘書素材；每個 Persona SHALL 在該 drill 中具有穩定的職員外觀、可見姓名及聲音。同一 Persona 再次被指派 SHALL 保留身分、外觀、聲音及既有記憶行為，並標示再次上場。新 drill SHALL 建立獨立角色名冊。舞台 SHALL 同時最多顯示這三種當前角色。

#### Scenario: Returning persona after refresh
- **WHEN** Mastermind 重用曾通話的 Persona，且使用者重新整理頁面
- **THEN** 角色仍使用原先外觀與姓名，標示為再次上場，不因刷新或通話序號改變外觀

#### Scenario: More personas than sprite variants
- **WHEN** drill 建立的 Persona 數超過可用職員素材數
- **THEN** 素材可重用，但每位 Persona 的 ID、姓名與固定映射仍可區分

### Requirement: Call supervision and recap handoff

通話時 Persona SHALL 位於通話區，Judge SHALL 位於旁邊監看。通話結束後 Persona SHALL 離場，Judge SHALL 前往 Mastermind 旁整理與回報；只有真實回顧完成後 SHALL 顯示交付完成。後續規劃 SHALL 顯示 Mastermind 再次思考，並允許重複此循環。

#### Scenario: User hangs up one call
- **WHEN** 使用者掛斷本通但未結束整場
- **THEN** 輸入立即停止，Persona 離場、Judge 整理並前往回報位，回顧完成後交付，再依真實狀態顯示下輪規劃或報告

#### Scenario: Recap remains pending or fails
- **WHEN** Judge 已走到回報位置但回顧仍未完成，或模型回顧失敗
- **THEN** 舞台維持整理中或顯示失敗，不假裝已成功交付或自行安排下一個 Persona

#### Scenario: Non-user call ending
- **WHEN** Persona、Judge 或回合上限結束本通
- **THEN** 舞台使用相同收尾動線，顯示實際公開結束原因，且不插入已取消回合的晚到回覆

### Requirement: Authoritative controls and bounded animation lag

按鈕、輸入與當前狀態 SHALL 依伺服器最新快照決定，不依動畫進度決定。動畫 SHALL 可取消、加速或合併；前景且連線正常時，在收到最新更新後 SHALL 於 3 秒內追上其站位，不累積無界的待播過場。切換 drill 或終止演練 SHALL 取消失效演出。

#### Scenario: Fast consecutive transitions
- **WHEN** 回顧完成、規劃完成及新指派在前一段動畫結束前抵達
- **THEN** 介面保留有序活動紀錄、縮短過場並追上最新狀態，不遺漏可操作的待接通角色或重複進場

#### Scenario: Finish or fail during movement
- **WHEN** 使用者要求結束整場，或伺服器回傳 failed／interrupted
- **THEN** 介面立即依該狀態更新控制，取消過期說話與新角色進場，保留既有逐字稿且不自行重試模型

### Requirement: Restore current state without replay

首次開啟、重新整理、回到前景或切換 drill 時，舞台 SHALL 以最新快照還原站位，不重播整場歷史。舊資料沒有舞台事件時 SHALL 可顯示靜態角色與既有紀錄。連線中斷 SHALL 明示重新連線狀態，且不推演尚未確認的進度。

#### Scenario: Refresh during a call
- **WHEN** 使用者在 Persona 回覆中重新整理
- **THEN** 顯示同一通的 Persona 與 Judge 位置、已保存訊息及處理狀態，不再次接通、送出訊息或重跑進場

#### Scenario: Historical exercise without events
- **WHEN** 使用者開啟更新前的已完成或中斷 drill
- **THEN** 可查看原逐字稿及報告，舞台以終止狀態呈現而不捏造舊動畫事件

### Requirement: Public role activity and final reporting

舞台 SHALL 僅顯示公開工作狀態、姓名及角色摘要，不呈現模型內部推理、私有 prompts、任務事實、Judge 私有回顧或即時評分。總報告 SHALL 維持由 Reporter 產出並使用狀態卡及既有報告區展示。

#### Scenario: Thinking and reporting bubbles
- **WHEN** Mastermind 規劃或 Judge 整理回顧
- **THEN** 泡泡顯示「正在安排下一通」或「整理本通紀錄」等工作提示，不顯示內部推理、回顧內容或隱藏任務

#### Scenario: Whole exercise ends
- **WHEN** 已要求結束整場或演練達到結束條件
- **THEN** 不再安排新進場，完成必要回顧後顯示 Reporter 整理回饋，成功時展示保存的報告；失敗時保留紀錄及錯誤狀態

### Requirement: Accessible and legible motion

舞台 SHALL 提供文字標籤與節制的狀態朗讀，角色與動作不得成為理解進度的唯一方式。系統 SHALL 尊重 prefers-reduced-motion 並提供減少動畫控制；此模式直接定位、保留狀態及全部操作。圖格切換 SHALL 保持角色腳底穩定，不裁掉角色或使底色方塊遮擋鄰近角色。

#### Scenario: Reduced motion and keyboard use
- **WHEN** 使用者偏好減少動態效果或啟用減少動畫，並以鍵盤完成演練
- **THEN** 不播放移動與循環步行，仍可辨識角色分工並完成接通、送出、掛斷及查看報告

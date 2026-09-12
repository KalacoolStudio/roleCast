# evaluation-reporting Specification

## Purpose

讓文字及語音演練的評估具有獨立的判準、可追查的對話依據與明確的停止行為，從通話中即時觀察到通話後回顧及整場報告維持一致的證據來源，避免把模型推測當作使用者已展現的能力。

## Requirements

### Requirement: Independent evidence based watch
文字模式下 Judge SHALL 對每個已接受的完整使用者訊息進行 Watch，輸入包含本通雙方已完成的對話及情境判準。輸出 SHALL 包含是否停止、原因、相關判準及有效訊息 ID。Judge SHALL 不負責下一通的人設或話術設計，亦不得僅因模型自行宣告信心值高而判定達標。

#### Scenario: Clear criterion met
- **WHEN** 使用者訊息符合防詐情境定義的明確識破及查證條件
- **THEN** Judge 回傳停止決定與支持該判定的訊息 ID

#### Scenario: Ambiguous response
- **WHEN** 使用者只表示「好」而沒有足夠證據符合停止準則
- **THEN** Judge 不將該回答直接判為目標已完成

### Requirement: Stop call suppresses outstanding responses
系統 SHALL 在接受有效 StopCall 後立即將本通標為結束、取消未完成的 Persona 工作並禁止其後的回覆發布。Judge 評估 SHALL 不經 Mastermind 核准。重複或來自舊通話的停止結果 SHALL 不影響下一通。

#### Scenario: Stop while persona is generating
- **WHEN** Persona 尚在產生回覆時 Judge 判定停止
- **THEN** 本通結束，該回覆即使稍後完成也不顯示、不寫成已送出的 Persona 訊息，並且只建立一次回顧

#### Scenario: Duplicate or stale stop
- **WHEN** 同一通已結束後再次收到停止結果，或上一通的判定在新通開始後抵達
- **THEN** 系統保留原終止結果且不停止新通話

### Requirement: One recap per completed call
Judge SHALL 對每通因使用者、Persona、Judge 或情境上限而正常結束的已接通通話產出一份成功回顧，內容包括結束原因、關鍵事件、使用者透露或拒絕的事項、表現強弱項、未確定事項與證據 ID。Mastermind SHALL 等待有效回顧後才規劃下一通；模型失敗或程序中斷而無法產出回顧時 SHALL 明確顯示失敗或中斷，不能被當成已完成。

#### Scenario: Completed recap
- **WHEN** 通話掛斷且回顧成功
- **THEN** 回顧與該通逐字稿關聯保存，並成為 Mastermind 的下一次決策輸入

#### Scenario: Recap failure
- **WHEN** 回顧請求逾時或輸出驗證失敗且有限重試耗盡
- **THEN** 演練進入失敗狀態，保留逐字稿與原因，不啟動下一通或顯示虛構回顧

### Requirement: Final report grounded in recorded evidence
Reporter SHALL 在正常結束或使用者主動結束時，依逐字稿、情境判準及 Judge 回顧產出只評估使用者表現的報告。報告 SHALL 包含總結、各評估面向、證據引用、強項、改善建議及證據不足之處。Persona 訊息 SHALL 僅供理解使用者面對的情境，Reporter SHALL NOT 評估 Persona、角色設定、話術、任務交接或系統表現。所有報告引用 SHALL 指向該場真實存在的使用者訊息；未實際展現的能力 SHALL 不被當成已證實。Reporter SHALL 不接收 Mastermind 私有指引或隱藏背景事實；語音證據 SHALL 保留辨識、部分片段及播放不確定性，持續觀察行為依 voice-evidence 規格。

#### Scenario: Completed exercise
- **WHEN** 已有可用逐字稿與回顧且演練結束
- **THEN** 系統保存並顯示只評估使用者表現的報告，使用者可對照其引用的使用者逐字稿內容

#### Scenario: Persona behavior appears in the transcript
- **WHEN** Persona 的回覆、話術或交接品質可從逐字稿觀察
- **THEN** Reporter 僅將其視為使用者回應時的情境，不把 Persona 或系統表現寫入任何報告欄位，也不引用 Persona 訊息作為評估證據

#### Scenario: Insufficient evidence
- **WHEN** 使用者在沒有實質回答前結束演練
- **THEN** 系統不呼叫 Reporter 模型，直接產生固定的證據不足報告，不捏造表現或訊息引用

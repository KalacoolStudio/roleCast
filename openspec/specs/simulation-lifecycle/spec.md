# simulation-lifecycle Specification

## Purpose

定義文字及語音演練從選擇情境、指派角色、進行通話到結束的可觀察行為，讓不同演練情境共用流程，並確保 Mastermind、Judge、Persona 與 Reporter 的職責分離、角色身分持續存在及背景事實一致。

## Requirements

### Requirement: Scenario based sessions
系統 SHALL 提供防詐與模擬面試兩個內建劇本，並允許選擇自訂劇本。既有 scenario／session 用語 SHALL 以 plot／drill 呈現並保留相容 API。每個情境 SHALL 定義背景事實、演練目標、Judge 評估準則、停止條件與通話上限。使用者 SHALL 能選擇情境並提供選填的受測者背景。系統 SHALL 在每個私人工作區內同時只允許一場非終止演練，不同工作區可同時進行。

#### Scenario: Start an exercise
- **WHEN** 使用者選擇有效情境開始演練，且沒有其他進行中的演練
- **THEN** 系統建立獨立演練 ID，保存該次情境設定快照，並由 Mastermind 規劃第一通

#### Scenario: Concurrent start
- **WHEN** 同一工作區的另一場演練尚未結束時再次要求開始
- **THEN** 系統拒絕建立第二場，並提供該工作區既有演練的識別資訊；其他工作區不受影響

### Requirement: Planning only between calls
Mastermind SHALL 僅於第一通前與完成通話回顧後決策。其輸出 SHALL 為建立角色並指派、重用既有角色並指派或結束演練；指派 SHALL 包含任務目標與 Allowed Facts。每場 SHALL 固定使用建立時保存的劇本與有效角色指引，包含 Mastermind、Judge 及 Reporter 設定。

#### Scenario: Continue from recap
- **WHEN** 通話結束且 Judge Recap 已完成
- **THEN** Mastermind 根據情境、角色名冊、累積逐字稿與回顧決定下一個角色任務，或結束演練並交由 Reporter 產出總報告

#### Scenario: Active call isolation
- **WHEN** 使用者正在與 Persona 進行一通對話
- **THEN** 系統不呼叫 Mastermind 改寫任務、人設或即時對話

### Requirement: Persistent persona identity and scoped facts
Persona SHALL 在單次 drill 的名冊中持續存在，每通 SHALL 固定一個 Persona ID 與聲音。重用時 SHALL 保留原人設、聲音及該角色過往通話記憶；Mastermind 建立不同 Persona 時 SHALL 分配不同聲音。新 drill SHALL 從空白 Persona 名冊開始，不帶入先前 drill 的角色或對話。角色 SHALL 接收本次任務、允許事實與自己已知的使用者資訊，不接收其他角色的私有對話，除非 Mastermind 明確將其交付。系統 SHALL 拒絕與既有固定事實相矛盾的結構化指派。

#### Scenario: Recall the same persona
- **WHEN** Mastermind 選擇已完成一通對話的 Persona
- **THEN** 下一通沿用同一 ID、人設與聲音，帶入該角色的歷史及新任務，前一通逐字稿保持不變

#### Scenario: New drill roster
- **WHEN** 前一場 drill 已結束且使用者開始新的 drill
- **THEN** Mastermind 收到空白 Persona 名冊，且新角色不取得前一場的身分、聲音映射或對話記憶

#### Scenario: Contradictory assignment
- **WHEN** 新指派將既有訂單金額或角色身分等固定事實改為不同值
- **THEN** 該指派不會啟動通話，系統依模型輸出驗證失敗的流程處理

#### Scenario: Unknown background detail
- **WHEN** 使用者詢問 Allowed Facts 及角色記憶中沒有的背景細節
- **THEN** Persona 被要求表示未知或迴避確認，不把自行推測保存為新的固定事實

### Requirement: Controlled call boundaries
使用者 SHALL 能接受待開始的下一通、掛斷本通或結束整場。Persona SHALL 能申請收線。每通 SHALL 只有一個終止結果，且結束後禁止新訊息及角色輸出。不同角色 SHALL 經由新通話上場。達到情境通話上限 SHALL 結束演練並產出有足夠證據或證據不足的報告。

#### Scenario: Persona requests hangup
- **WHEN** Persona 申請掛斷且本通尚未結束
- **THEN** 系統記錄 Persona 收線原因、結束本通並觸發一次 Recap

#### Scenario: Participant ends exercise
- **WHEN** 使用者在規劃、待接通、通話或回顧期間要求結束整場
- **THEN** 系統停止啟動新通話，封存已有對話，完成必要回顧並嘗試產出報告；無可評估對話時明示證據不足

#### Scenario: Late message
- **WHEN** 訊息指定已結束的通話 ID
- **THEN** 系統拒絕該訊息，不將其歸入下一通

#### Scenario: Configured limits reached
- **WHEN** 情境設定的單通使用者回合上限或整場通話上限已達到
- **THEN** 系統結束該通並回顧；整場通話上限已達時產出總報告而不再指派下一通

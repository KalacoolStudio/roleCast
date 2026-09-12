# atm-drawer Specification

## Purpose

提供演練中的通用 ATM 操作介面，讓使用者以模擬餘額完成匯款或提款，並把實際操作納入通話證據供 Judge 判斷。

## Requirements

### Requirement: Right-side ATM drawer

演練頁面 SHALL 在右側持續露出可鍵盤操作的 ATM 頁籤。開啟頁籤 SHALL 以 drawer 顯示通用且不含特定銀行品牌的 ATM 頁面，並提供可用餘額、匯款、提款及本場操作紀錄。使用者 SHALL 能以關閉按鈕、背景區域或 Escape 關閉 drawer；窄螢幕 SHALL 保留頁籤與全部操作且不得造成水平溢位。

#### Scenario: Open the ATM drawer

- **WHEN** 使用者在演練頁面啟用右側 ATM 頁籤
- **THEN** 系統顯示目前 drill 的可用餘額、匯款與提款功能，且介面不呈現任何銀行名稱或品牌

### Requirement: Drill-scoped simulated balance

每個新 drill SHALL 建立 NT$100,000 模擬餘額。成功匯款或提款 SHALL 扣除指定整數金額並保存操作後餘額；重整同一 drill SHALL 保留餘額及操作紀錄，新 drill SHALL 重新建立獨立餘額。系統 SHALL 拒絕非正整數、超過單次上限、餘額不足、通話外或已結束通話的操作，且不得改變餘額。重試相同 client action ID SHALL 為冪等操作。

#### Scenario: Transfer during a call

- **WHEN** 使用者在語音通話已接通時輸入有效收款帳號與未超過餘額的匯款金額
- **THEN** 系統只保存帳號末四碼、扣除一次金額、更新 drawer 餘額並顯示成功結果

#### Scenario: Withdraw during a call

- **WHEN** 使用者在語音通話已接通時輸入未超過餘額的提款金額
- **THEN** 系統扣除一次金額、更新 drawer 餘額並顯示成功結果

#### Scenario: Reject insufficient funds

- **WHEN** 匯款或提款金額大於目前餘額
- **THEN** 系統顯示餘額不足且不建立操作紀錄、不改變餘額

### Requirement: ATM actions as Judge evidence

每次成功 ATM 操作 SHALL 以 `source=atm` 的使用者訊息寫入當前 call，包含動作、金額、操作後餘額及匯款帳號末四碼。公開 drill 快照、通話逐字紀錄、Judge 即時觀察、Recap 與 Reporter SHALL 接收相同的不可變操作證據；完整收款帳號不得保存或回傳。語音連線中的 Judge SHALL 在操作保存後立即執行評估，不需等待下一段語音逐字稿。

#### Scenario: Judge observes an ATM action

- **WHEN** 使用者在進行中的語音通話完成匯款或提款
- **THEN** 操作訊息立即進入該通話 context，Judge 可引用其 message ID 作為評估證據，且 drawer 與通話紀錄顯示相同結果

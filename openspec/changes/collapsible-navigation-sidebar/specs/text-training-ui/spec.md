## ADDED Requirements

### Requirement: Collapsible shared navigation sidebar

共用左側導覽列 SHALL 提供在背景未被模態視窗暫時停用時可操作的收合／展開按鈕，首次載入與重新整理頁面時 SHALL 預設展開。展開時 SHALL 保留品牌連結、開始新演練、劇本工作室、適用時的繼續目前演練、歷史報告入口與紀錄數量及依螢幕寬度顯示的工作區資訊。收合時 SHALL 隱藏導覽操作、歷史報告入口及側欄底部資訊，並保留可見的展開按鈕；歷史報告頁內的列表、所選報告與公開時間軸 SHALL 保持呈現，不因側欄收合而隱藏。

#### Scenario: Collapse and restore desktop navigation
- **WHEN** 使用者在寬螢幕按下「收合側邊欄」
- **THEN** 左側導覽縮成窄欄，主內容取得釋出的寬度，導覽操作與歷史報告入口隱藏，且「展開側邊欄」按鈕保持可見
- **AND** 再按「展開側邊欄」後恢復原先導覽內容、目前選取狀態及可操作的歷史報告入口

#### Scenario: Initial and refreshed page
- **WHEN** 使用者首次載入或重新整理頁面
- **THEN** 左側導覽列預設展開，且演練與語音依既有重新整理安全規則還原

### Requirement: Sidebar toggling preserves workspace state

收合與展開 SHALL 僅改變導覽呈現，保留目前畫面、劇本工作室尚未儲存的內容、所選劇本與歷史報告、演練與通話識別、既有字幕及進行中的語音連線。切換側欄 SHALL NOT 觸發演練操作、語音停止或重新連線。收合狀態 SHALL 在同一頁面內切換畫面及調整視窗寬度時保留。

#### Scenario: Toggle while editing
- **WHEN** 使用者在首頁選取劇本或在劇本工作室修改尚未儲存的內容，然後收合並展開側欄
- **THEN** 目前畫面、選取的劇本與未送出的欄位內容保持不變

#### Scenario: Toggle during a voice call
- **WHEN** 使用者在語音通話進行中收合並展開側欄
- **THEN** 同一場與同一通話保持進行，語音持續收音與播放、既有字幕仍可見，且不重新要求麥克風授權或重播開場

#### Scenario: Navigate within the current page
- **WHEN** 使用者在側欄收合時透過主內容操作切換畫面
- **THEN** 側欄維持收合，展開後反映最新的導覽選取狀態與歷史報告數量

### Requirement: Responsive and accessible sidebar toggle

收合／展開按鈕 SHALL 使用繁體中文可存取名稱「收合側邊欄」與「展開側邊欄」、提供正確的展開狀態及受控制區域關聯，並支援鍵盤操作與可見焦點。切換後焦點 SHALL 保留在按鈕上；被收合隱藏的內容 SHALL 不可透過 Tab 聚焦，亦不作為可操作內容提供給輔助科技。窄螢幕收合時 SHALL 保留包含品牌及展開按鈕的精簡頁首；展開後 SHALL 保留手機版歷史報告入口，並沿用獨立報告頁的選取與導覽行為。兩種側欄狀態 SHALL 在 320px 至 1440px 的檢查寬度無水平溢出；若有新增收合動畫，SHALL 尊重減少動態效果偏好。

#### Scenario: Keyboard collapse and expand
- **WHEN** 使用者以鍵盤聚焦側欄按鈕並以 Enter 或 Space 收合或展開
- **THEN** 按鈕可見焦點保留、名稱與展開狀態同步更新，且 Tab 不會進入收合的導覽內容

#### Scenario: Mobile sidebar and reports
- **WHEN** 使用者在 390px 寬的手機開啟歷史報告並選取一筆紀錄，再收合並展開側欄
- **THEN** 收合時導覽僅留下品牌及展開按鈕的精簡頁首，主內容的報告列表與所選報告保持可讀，展開後歷史報告入口保留選取狀態，不重新引入舊版手機紀錄開關

#### Scenario: Resize a collapsed sidebar
- **WHEN** 使用者在收合狀態下跨越手機與桌面版寬度調整視窗，或啟用減少動態效果
- **THEN** 側欄維持收合、展開控制保持可見且可操作、主內容保持可讀，頁面不產生水平溢出，且減少動態效果模式不播放新增的收合動畫

#### Scenario: Sidebar and incoming-call popup
- **WHEN** 使用者收合來電視窗後切換側欄，再重新開啟同一通來電並接聽
- **THEN** 切換側欄不改變待接通指派或自行啟動語音；來電視窗開啟時保留背景不可聚焦的既有行為，關閉或接聽後恢復側欄操作與原先收合狀態

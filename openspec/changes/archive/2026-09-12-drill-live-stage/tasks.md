## 1. 素材與素色舞台

- [x] 1.1 建立五種角色素材 manifest，檢查待機／移動影格、底色、裁切及腳底錨點，必要時新增衍生素材並保留來源；以逐格預覽確認角色完整、無跳動與遮擋用的背景方塊。
- [x] 1.2 建立 CharacterSprite 與 DrillStage，定義相對站位、固定路線、角色名稱、思考與交付提示；以離線 fixture 畫面驗證所有角色、朝向、等待與步行狀態，無需模型 API。

## 2. 持久化事件與演練整合

- [x] 2.1 新增 SQLite v3 遷移、事件表、publicRevision、watermark 與 Persona 外觀映射，支援狀態與事件原子保存；以 storage 測試驗證回滾、嚴格順序、映射重用、v1／v2 升級及原紀錄不變。
- [x] 2.2 在 engine 規劃、指派、通話／回合、收線、回顧、報告與失敗邊界加入公開事件，擴充 view 的 stage 中繼資料；以 fixture 驗證完整順序、快切換、重複請求、取消及晚到工作不重複提交，事件不含私有 markers。
- [x] 2.3 將 recover 接上 interrupted 事件，保留 legacy routes 與既有回應欄位；以重新開啟資料庫及 legacy API 測試驗證只中斷一次、不重跑模型、舊歷史正常讀取。

## 3. 事件 API 與串流

- [x] 3.1 新增有上限的事件分頁 API 與一致的快照 watermark；以 API 測試驗證 after／limit、跨頁排序、400／404／409、drill 隔離及公開 payload 白名單。
- [x] 3.2 實作 SSE 補接與即時通知、Last-Event-ID 優先順序、公開快照、心跳、backpressure 及清理；以真實本機 HTTP 串流測試驗證補接期間新事件不遺漏、重連、慢 client、關閉連線與 app shutdown，不需外部模型。

## 4. 前端狀態與動畫控制

- [x] 4.1 建立快照／事件 consumer，處理 revision 防回退、sequence 去重／缺口、SSE 重連、輪詢 fallback 與 drill 切換清理；以模擬傳輸測試驗證重複／亂序、分頁補接、失效回應及不增加業務 API 呼叫。
- [x] 4.2 建立可取消動畫排程，完成進場、監看、離場、回報、思考循環與 created／reused 呈現；以受控時鐘測試驗證因果順序、回顧未完成不交付、3 秒追赶、及提早接通／掛斷／結束／失敗會取消失效動作。
- [x] 4.3 把舞台與活動紀錄整合至既有 drill 頁，維持接通、輸入、掛斷、結束整場與 Reporter 報告流程；以 Playwright 完成三通含重用 Persona 的 drill，確認控制由真實狀態決定且無重複請求。
- [x] 4.4 完成桌面並排、手機上下與輸入時精簡舞台，加入減少動畫、鍵盤操作及文字狀態；以桌面／390px 截圖和 reduced-motion 瀏覽器測試確認無水平溢出、角色遮擋與控制不可達。
- [x] 4.5 完成刷新、前景恢復、舊資料／舊快照降級與 terminal 展示；以瀏覽器測試驗證位置還原、不重播、不重新送訊息，以及斷線和中斷歷史可讀。

## 5. 整體驗證與使用說明

- [x] 5.1 補齊跨層案例：Judge／Persona／上限收線、快速回顧及指派、回顧失敗、各階段結束整場、串流 fallback、通話中刷新；執行 just check 與 just test 通過，確認模型呼叫次數與原流程相同。
- [x] 5.2 用正式 build／start 驗證素材 URL 與 SSE，並記錄現有同來源 tunnel 流程的驗證方法；更新 README 的 just 啟動、舞台操作、遷移備份／回退說明，交付桌面與手機截圖及驗證紀錄，執行 openspec validate drill-live-stage --strict 通過。

## 6. 移動 sprite 同步修正

- [x] 6.1 依角色實際位置變化播放 manifest 中的步行圖格，將位移時間與步行開始／停止同步，抵達切回待機並依方向鏡像；以瀏覽器取樣驗證 Persona 進退場及 Judge 往返期間位置與圖格同時變化，且減少動畫與還原仍直接定位。

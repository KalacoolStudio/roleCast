# Role Cast

本機瀏覽器中的多角色文字演練。選擇防詐或後端工程師面試情境，與 Persona 對話，結束後查看逐字稿及附有證據引用的回饋報告。

Mastermind 在通話間安排角色與任務，Judge 評估使用者回答並可停止本通；同一 Persona 可再次回撥。背景見 [guidelines](guidelines)，實作範圍見 [文字 MVP 提案](openspec/changes/role-cast-text-mvp/proposal.md)。

## 快速開始

需要 Node.js **22.12 以上**、npm、[just](https://just.systems/man/en/packages.html) 及 POSIX shell（Linux、macOS 或 WSL）。已驗證環境：Node.js 26.7.0、npm 11.19.0、just 1.58.0。原始碼與工具使用 JavaScript／JSX，不需 Python 或 TypeScript 編譯。

在專案根目錄執行：

```sh
just setup
```

setup 安裝鎖定依賴、準備 `data/`，僅在 `.env` 不存在時從 `.env.example` 建立，不覆寫既有金鑰。

在根目錄 `.env` 填入三個必填欄位：

```dotenv
LLM_API_KEY=填入你的金鑰
LLM_BASE_URL=填入供應商的相容 API 基礎網址
LLM_MODEL=填入供應商的模型 ID
PORT=3000
DATABASE_PATH=./data/role-cast.sqlite
```

使用 **OpenAI-compatible Chat Completions** 端點。基礎網址應包含供應商要求的版本路徑（例如 `/v1`），不要包含 `/chat/completions`；adapter 會補上該路徑。模型需能依提示輸出 JSON。本程式不要求原生 JSON schema 模式，也不保證相容各供應商的私有 API。程序環境變數優先於 `.env`。

```sh
just dev
```

開啟 **http://127.0.0.1:5173**。前端代理 `/api` 至後端（預設 3000）。前端修改後自動更新；修改後端或 `.env` 後，按 **Ctrl-C** 停止前後端，再執行 `just dev`。任一子程序失敗時也會停止另一個服務。

## 操作指令

執行 `just` 或 `just --list` 查看 [justfile](justfile) 的指令與用途。

| 指令              | 用途                                           |
| ----------------- | ---------------------------------------------- |
| `just setup`      | 安裝依賴、準備環境，保留既有 `.env`            |
| `just dev`        | 啟動開發前後端；使用 5173 網址                 |
| `just test-setup` | 安裝 Playwright Chromium，首次瀏覽器測試前執行 |
| `just test`       | 建置後執行單元、整合與瀏覽器測試               |
| `just check`      | JavaScript lint 與格式檢查                     |
| `just build`      | 建置正式介面                                   |
| `just start`      | 啟動已建置的介面與 API；使用 3000 網址         |
| `just status`     | 檢查服務/資料庫健康；未啟動時返回非零狀態      |

正式本機模式：

```sh
just build
just start
```

開啟 **http://127.0.0.1:3000**（或設定的 PORT）。此 MVP 僅供本機使用，沒有帳號與遠端部署功能。

## 演練流程

1. 選擇情境，可選填背景後開始；一次只允許一場進行中的演練。
2. 下一位角色準備好後按「接通對話」，等待開場，再輸入回覆。
3. Persona 與 Judge 同時處理回合；Judge 允許繼續後才顯示完整回覆。等待期間仍可掛斷或結束整場。
4. 每通結束後整理回顧，可能由同一位或另一位角色來電；也可直接結束整場。
5. 查看最終報告，點擊證據文字對照原訊息。歷史列表保留已完成、失敗及中斷的演練。

預設每場最多 3 通，每通最多 12 個使用者回合。背景最多 2,000 字，單則訊息最多 4,000 字。每次模型操作最多 30 秒、最多 2 次嘗試；驗證失敗會明確停止演練，保留已有紀錄。

## 資料與金鑰

`.env` 僅由後端讀取，金鑰不送至瀏覽器、不寫入資料庫或日誌。`.env` 與 `data/` 已由 Git 忽略；請勿在 `VITE_` 開頭的設定放入秘密。

逐字稿、角色與報告保存在本機 SQLite，**推論所需對話與背景會送至你設定的外部 LLM API**。這不是離線模型；guidelines 的本機留存描述不代表供應商不處理或保存推論資料。防詐操作都是文字情境，沒有真實轉帳或電話連線。

瀏覽器重新整理會還原同一場。後端重新啟動時，未結束演練標為「已中斷」並保留已接受訊息，不自動重送請求、續接舊通話或補造報告。請開始新演練。不要同時啟動兩個後端使用同一資料庫。

## 驗證與故障排除

```sh
just test-setup
just test
just check
```

測試使用暫存 SQLite、受控 Agent 與本機 HTTP provider stub，不讀取真實 key、不呼叫付費模型 API。Playwright 服務使用 3100 port，測試前請確保它可用。Chromium 若缺少系統函式庫，請依 [Playwright 系統需求](https://playwright.dev/docs/intro#system-requirements) 安裝相應套件。SQLite binding 使用預編譯套件；若所選 Node/平台沒有對應套件，請使用支援的 Node 版本。

- 「請檢查設定」：修正列出的 `.env` 欄位後重新啟動。
- 「模型 API 驗證失敗」：確認金鑰與端點屬於同一服務。
- 「模型 API 不接受此請求」：確認模型 ID、Chat Completions 協定與 base URL 路徑。
- 「模型回應未通過格式或證據驗證」：可換用更能遵循 JSON 與引用規則的模型。
- 連接埠衝突：停止佔用程式或設定後端 PORT；開發前端固定使用 5173。

### 真實模型 smoke checklist

自動化測試證明流程及資料契約，不代表真實模型品質。配置自己的 API 後，可人工檢查：

- 兩個情境是否能以繁體中文開場及自然追問。
- 同角色回撥是否延續自身記憶，且未改變身分或固定事實。
- 明確質疑詐騙並提出官方查證時是否合理停止；單純「好」不應當成已達標。
- 面試評語是否反映實際回答，引用是否對照原文。
- 結束整場或失敗後是否保留紀錄，且沒有遲到回覆。

請記錄供應商、模型、通過項目與失敗例子；模型本身的語意判斷仍可能出錯。

[private]
default:
    @just --list

# 安裝鎖定依賴，保留既有 .env
setup:
    node scripts/setup.js

# 啟動本機前後端；Ctrl-C 同時停止
dev:
    exec node scripts/dev.js

# 執行離線單元、整合與瀏覽器測試
test:
    npm run build
    npm test

# 安裝瀏覽器測試所需的 Chromium
test-setup:
    npx playwright install chromium

# 執行 JavaScript lint 與格式檢查
check:
    npm run check

# 建置正式介面（不需 API key）
build:
    npm run build

# 啟動已建置的介面與 API
start:
    exec node apps/server/src/main.js

# 使用 ngrok 分享已啟動的正式介面與 API
tunnel:
    exec node scripts/tunnel.js

# 查看本機服務健康狀態
status:
    node scripts/status.js

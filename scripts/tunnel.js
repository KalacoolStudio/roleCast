import { spawnSync } from "node:child_process";
import { readEnvironment } from "../apps/server/src/config.js";

const port = Number(readEnvironment().PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("請檢查設定：PORT");
  process.exit(1);
}

const result = spawnSync("ngrok", ["http", `http://127.0.0.1:${port}`], {
  stdio: "inherit",
});
if (result.error) {
  console.error(
    result.error.code === "ENOENT"
      ? "找不到 ngrok。請先安裝並設定 authtoken：https://ngrok.com/docs/start"
      : "無法啟動 ngrok，請檢查安裝與執行權限。",
  );
}
process.exitCode = result.status ?? 1;

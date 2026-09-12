import { resolve } from "node:path";
import { readEnvironment, root } from "../apps/server/src/config.js";
import { supervise } from "./supervisor.js";
const env = readEnvironment();
const port = Number(env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("請檢查設定：PORT");
  process.exit(1);
}
supervise([
  {
    command: process.execPath,
    args: ["apps/server/src/main.js"],
    options: { cwd: root },
  },
  {
    command: process.execPath,
    args: [
      resolve(root, "node_modules/vite/bin/vite.js"),
      "--config",
      "apps/web/vite.config.js",
    ],
    options: { cwd: root, env: { ...process.env, PORT: String(port) } },
  },
]);

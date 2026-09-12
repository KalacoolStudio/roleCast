import { readEnvironment } from "../apps/server/src/config.js";
const port = Number(readEnvironment().PORT || 3000);
try {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error();
  const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok || (await response.json()).status !== "ok")
    throw new Error();
  console.log(`Role Cast 服務正常：http://127.0.0.1:${port}`);
} catch {
  console.log("Role Cast 尚未啟動或無法連線。請執行 just dev 或 just start。");
  process.exitCode = 1;
}

import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { Store } from "../../../packages/storage/src/store.js";
import { Agents } from "../../../packages/core/src/agents.js";
import { Engine } from "../../../packages/core/src/engine.js";
try {
  const config = loadConfig();
  const store = new Store(config.databasePath);
  store.recover();
  const app = await createApp(new Engine(store, new Agents(config)));
  await app.listen({ port: config.port, host: "127.0.0.1" });
  console.log(`Role Cast: http://127.0.0.1:${config.port}`);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (error) {
  console.error(
    error.message?.startsWith("請檢查設定")
      ? error.message
      : "啟動失敗，請檢查資料庫、設定與連接埠。",
  );
  process.exitCode = 1;
}

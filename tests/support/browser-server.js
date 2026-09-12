import { createApp } from "../../apps/server/src/app.js";
import { Store } from "../../packages/storage/src/store.js";
import { Engine } from "../../packages/core/src/engine.js";
import { fixtureAgents } from "./fixtures.js";
const store = new Store();
const engine = new Engine(store, fixtureAgents({}, 150));
// Persist terminal examples for history UI tests; this setup is never imported by production.
const failedId = engine.start("interview");
const failed = store.get(failedId);
failed.state = "failed";
failed.error = {
  code: "MODEL_AUTH",
  message: "模型 API 驗證失敗，請檢查後端設定。",
};
store.save(failed);
engine.start("anti-fraud");
store.recover();
const app = await createApp(engine);
await app.listen({
  host: "127.0.0.1",
  port: Number(process.env.ROLECAST_TEST_PORT || 3100),
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });

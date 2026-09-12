// Explicitly mounted by the container smoke test; never copied into the release image.
import {
  loadConfig,
  verifyCloudStorage,
} from "../../apps/server/src/config.js";
import { createApp } from "../../apps/server/src/app.js";
import { Store } from "../../packages/storage/src/store.js";
import { Engine } from "../../packages/core/src/engine.js";
import { fixtureAgents } from "./fixtures.js";
const config = loadConfig();
verifyCloudStorage(config);
const store = new Store(config.databasePath);
store.recover();
const app = await createApp(new Engine(store, fixtureAgents({}, 100)), {
  deploymentMode: config.deploymentMode,
});
await app.listen({ host: config.host, port: config.port });
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });

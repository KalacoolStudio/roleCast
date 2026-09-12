import { expect, it } from "vitest";
import { loadConfig, verifyCloudStorage } from "../apps/server/src/config.js";
import { createApp } from "../apps/server/src/app.js";
import { harness } from "./support/fixtures.js";

const values = {
  LLM_API_KEY: "SENTINEL_NOT_A_REAL_SECRET",
  LLM_BASE_URL: "https://provider.invalid/v1",
  LLM_MODEL: "fixture",
};
it("keeps local defaults and requires explicit valid cloud storage", () => {
  expect(loadConfig("/nonexistent", values)).toMatchObject({
    host: "127.0.0.1",
    deploymentMode: "local",
    port: 3000,
  });
  const cloud = {
    ...values,
    HOST: "0.0.0.0",
    PORT: "8080",
    DEPLOYMENT_MODE: "gcp",
    DATABASE_PATH: "/data/role-cast.sqlite",
  };
  const config = loadConfig("/nonexistent", cloud);
  expect(config).toMatchObject({
    host: "0.0.0.0",
    port: 8080,
    deploymentMode: "gcp",
  });
  for (const patch of [
    { HOST: "SENTINEL_NOT_A_REAL_SECRET" },
    { DEPLOYMENT_MODE: "public" },
    { DATABASE_PATH: "./data/db" },
    { DATABASE_PATH: "" },
    { DATABASE_PATH: "/tmp/db" },
  ]) {
    expect(() => loadConfig("/nonexistent", { ...cloud, ...patch })).toThrow(
      "請檢查設定",
    );
  }
  expect(() =>
    verifyCloudStorage(config, "1 0 0:1 / / rw - overlay overlay rw"),
  ).toThrow("persistent /data mount required");
  expect(() =>
    verifyCloudStorage(config, "2 1 8:1 /app /data ro - ext4 /dev/sdb ro"),
  ).toThrow();
  expect(() =>
    verifyCloudStorage(
      config,
      "2 1 8:1 /app /data rw,relatime - ext4 /dev/sdb rw",
    ),
  ).not.toThrow();
  expect(() =>
    verifyCloudStorage({ deploymentMode: "local" }, ""),
  ).not.toThrow();
});

it("only discloses the deployment mode and retains browser-origin protection", async () => {
  const h = harness();
  const app = await createApp(h.engine, {
    deploymentMode: "gcp",
    webRoot: "/nonexistent",
  });
  try {
    expect((await app.inject("/api/runtime")).json()).toEqual({
      deploymentMode: "gcp",
    });
    expect((await app.inject("/api/health")).json()).toEqual({ status: "ok" });
    expect(
      (
        await app.inject({
          url: "/api/runtime",
          headers: { origin: "https://untrusted.invalid" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/runtime",
          headers: { origin: "http://127.0.0.1:18080" },
        })
      ).statusCode,
    ).toBe(200);
  } finally {
    await app.close();
  }
});

import { afterEach, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, liveConfiguration } from "../apps/server/src/config.js";
import { prepare } from "../scripts/setup.js";
import { createApp } from "../apps/server/src/app.js";
import { harness, ready, until } from "./support/fixtures.js";
const cleanup = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
it("validates settings and env priority without revealing values; setup preserves .env", () => {
  const dir = mkdtempSync(join(tmpdir(), "role-cast-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(
    join(dir, ".env.example"),
    "API_KEY=\nLLM_BASE_URL=\nLLM_MODEL=\n",
  );
  prepare(dir);
  expect(() => loadConfig(dir, {})).toThrow("API_KEY");
  const contents =
    "LLM_API_KEY=SENTINEL_SECRET\nLLM_BASE_URL=https://example.test/v1\nLLM_MODEL=first\n";
  writeFileSync(join(dir, ".env"), contents);
  prepare(dir);
  expect(readFileSync(join(dir, ".env"), "utf8")).toBe(contents);
  expect(loadConfig(dir, { LLM_MODEL: "override" })).toMatchObject({
    model: "override",
    apiKey: "SENTINEL_SECRET",
    port: 3000,
    outputMode: "auto",
  });
  for (const mode of ["auto", "json_schema", "json_object", "text"])
    expect(loadConfig(dir, { LLM_OUTPUT_MODE: mode }).outputMode).toBe(mode);
  for (const patch of [
    { LLM_BASE_URL: "https://user:SENTINEL_SECRET@example.test" },
    { PORT: "SENTINEL_SECRET" },
    { LLM_BASE_URL: "bad" },
    { LLM_OUTPUT_MODE: "SENTINEL_SECRET" },
  ]) {
    try {
      loadConfig(dir, patch);
      throw new Error("should fail");
    } catch (e) {
      expect(e.message).not.toContain("SENTINEL_SECRET");
      expect(e.message).toContain("請檢查設定");
    }
  }
});
it("API validates inputs, exposes only public snapshots, and has idempotent commands", async () => {
  const h = harness();
  const app = await createApp(h.engine, {
    webRoot: "/nonexistent",
    testWorkspaceToken: "runtime-test",
  });
  cleanup.push(() => app.close());
  expect((await app.inject("/api/health")).json()).toEqual({ status: "ok" });
  expect((await app.inject("/api/plots")).body).not.toContain("stopCondition");
  expect(
    (await app.inject({ method: "POST", url: "/api/drills", payload: {} }))
      .statusCode,
  ).toBe(400);
  expect((await app.inject("/api/drills/missing")).statusCode).toBe(404);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/drills",
        headers: { origin: "https://attacker.test" },
        payload: { plotId: "anti-fraud" },
      })
    ).statusCode,
  ).toBe(403);
  const response = await app.inject({
    method: "POST",
    url: "/api/drills",
    payload: { plotId: "anti-fraud" },
  });
  expect(response.statusCode).toBe(202);
  const { id } = response.json();
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/drills",
        payload: { plotId: "interview" },
      })
    ).statusCode,
  ).toBe(409);
  await until(() => h.store.get(id).state === "awaiting_call");
  const payload = { assignmentId: h.store.get(id).pendingAssignmentId };
  const accept = await app.inject({
    method: "POST",
    url: `/api/drills/${id}/calls/accept`,
    payload,
  });
  const callId = accept.json().callId;
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/drills/${id}/calls/accept`,
        payload,
      })
    ).json().callId,
  ).toBe(callId);
  await until(() => !h.store.get(id).busy);
  const url = `/api/drills/${id}/calls/${callId}/messages`;
  expect(
    (
      await app.inject({
        method: "POST",
        url,
        payload: { clientMessageId: "x", text: " " },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await app.inject({
        method: "POST",
        url,
        payload: { clientMessageId: "x", text: "x".repeat(4001) },
      })
    ).statusCode,
  ).toBe(400);
  const accepted = await app.inject({
    method: "POST",
    url,
    payload: { clientMessageId: "x", text: "好" },
  });
  expect(accepted.statusCode).toBe(202);
  expect(
    (
      await app.inject({
        method: "POST",
        url,
        payload: { clientMessageId: "x", text: "好" },
      })
    ).json(),
  ).toEqual(accepted.json());
  expect(
    (
      await app.inject({
        method: "POST",
        url,
        payload: { clientMessageId: "x", text: "不同" },
      })
    ).statusCode,
  ).toBe(409);
  await until(() => !h.store.get(id).busy);
  const view = (await app.inject(`/api/drills/${id}`)).json();
  expect(view.calls[0].messages.map((m) => m.sequence)).toEqual([1, 2, 3]);
  expect(JSON.stringify(view)).not.toMatch(
    /personality|sharedMessageIds|stopCondition|prompts|apiKey/,
  );
  await app.inject({
    method: "POST",
    url: `/api/drills/${id}/finish`,
    payload: {},
  });
  await until(() => h.store.get(id).state === "completed");
  expect((await app.inject(`/api/drills/${id}/report`)).statusCode).toBe(200);
});
it("shared API_KEY enables public voice capability without exposing credentials or opening Live", async () => {
  const h = harness();
  const app = await createApp(h.engine, {
    webRoot: "/nonexistent",
    testWorkspaceToken: "runtime-test",
    voice: liveConfiguration({
      API_KEY: "SHARED_KEY_SENTINEL",
      OPENAI_API_KEY: "OBSOLETE_KEY_SENTINEL",
    }),
  });
  cleanup.push(() => app.close());
  const response = await app.inject("/api/capabilities");
  expect(response.json()).toEqual({
    voice: { available: true, model: "gpt-live-1" },
  });
  expect(response.body).not.toMatch(/SENTINEL|apiKey|API_KEY/);
  expect(app.voice.items.size).toBe(0);
});
it("shutdown makes pending work unable to touch a closed database", async () => {
  const h = harness();
  const app = await createApp(h.engine, {
    webRoot: "/nonexistent",
    testWorkspaceToken: "runtime-test",
  });
  const { id } = await ready(h);
  h.engine.finish(id);
  await app.close();
  expect(h.engine.disposed).toBe(true);
});

it("serves tunnel assets and API commands while rejecting unrelated origins", async () => {
  const webRoot = mkdtempSync(join(tmpdir(), "role-cast-web-"));
  cleanup.push(() => rmSync(webRoot, { recursive: true, force: true }));
  writeFileSync(join(webRoot, "app.js"), "console.log('ready');");
  writeFileSync(join(webRoot, "app.css"), "body { color: black; }");
  const h = harness();
  const app = await createApp(h.engine, {
    webRoot,
    testWorkspaceToken: "runtime-test",
  });
  cleanup.push(() => app.close());
  const host = "role-cast.ngrok-free.app";
  const headers = {
    host,
    origin: `https://${host}`,
    "x-forwarded-proto": "https",
  };
  for (const url of ["/app.js", "/app.css", "/api/health"]) {
    expect((await app.inject({ url, headers })).statusCode).toBe(200);
  }
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/drills",
        headers,
        payload: { plotId: "anti-fraud" },
      })
    ).statusCode,
  ).toBe(202);
  for (const origin of [
    "https://another.ngrok-free.app",
    `https://${host}.attacker.test`,
    `https://${host}:444`,
    `http://${host}`,
    `ftp://${host}`,
    "null",
    "malformed",
  ]) {
    for (const url of ["/app.js", "/api/drills"]) {
      const response = await app.inject({
        method: url.startsWith("/api/") ? "POST" : "GET",
        url,
        headers: { ...headers, origin, "x-forwarded-host": origin },
      });
      expect(response.statusCode).toBe(403);
    }
  }
  expect(
    (
      await app.inject({
        url: "/api/health",
        headers: {
          host: "127.0.0.1:3000",
          origin: `https://${host}`,
          "x-forwarded-host": host,
        },
      })
    ).statusCode,
  ).toBe(403);
  for (const origin of [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://[::1]:5173",
  ]) {
    expect(
      (await app.inject({ url: "/api/health", headers: { origin } }))
        .statusCode,
    ).toBe(200);
  }
});

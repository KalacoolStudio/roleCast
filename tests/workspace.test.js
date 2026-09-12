import { afterEach, expect, it } from "vitest";
import { once } from "node:events";
import WebSocket from "ws";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../apps/server/src/app.js";
import { Engine } from "../packages/core/src/engine.js";
import { Store } from "../packages/storage/src/store.js";
import { fixtureAgents, harness, until } from "./support/fixtures.js";
import { fakeLive } from "./support/voice.js";

const cleanups = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});

const cookie = (response) => response.headers["set-cookie"].split(";", 1)[0];
const request = (app, workspace, options) =>
  app.inject({
    ...(typeof options === "string" ? { url: options } : options),
    headers: {
      ...(typeof options === "string" ? {} : options.headers),
      cookie: workspace,
    },
  });

it("isolates plots, drills, active limits and commands between browser workspaces", async () => {
  const h = harness();
  const app = await createApp(h.engine, { webRoot: "/missing" });
  cleanups.push(() => app.close());

  expect((await app.inject("/api/plots")).statusCode).toBe(401);
  const first = cookie(await app.inject("/api/workspace"));
  const second = cookie(await app.inject("/api/workspace"));
  expect(first).not.toBe(second);

  const firstPlot = (await request(app, first, "/api/plots/anti-fraud")).json();
  const { id: _id, ...firstDefinition } = firstPlot;
  const edited = (
    await request(app, first, {
      method: "PUT",
      url: "/api/plots/anti-fraud",
      payload: { ...firstDefinition, name: "第一位使用者的劇本" },
    })
  ).json();
  expect(edited.name).toBe("第一位使用者的劇本");
  expect(
    (await request(app, second, "/api/plots/anti-fraud")).json().name,
  ).toBe(firstPlot.name);

  const firstDrill = (
    await request(app, first, {
      method: "POST",
      url: "/api/drills",
      payload: { plotId: "anti-fraud" },
    })
  ).json();
  const secondDrill = (
    await request(app, second, {
      method: "POST",
      url: "/api/drills",
      payload: { plotId: "anti-fraud" },
    })
  ).json();
  expect(firstDrill.id).not.toBe(secondDrill.id);

  await until(
    () =>
      h.store.db
        .prepare("SELECT state FROM sessions WHERE id=?")
        .get(firstDrill.id).state === "awaiting_call" &&
      h.store.db
        .prepare("SELECT state FROM sessions WHERE id=?")
        .get(secondDrill.id).state === "awaiting_call",
  );
  expect(
    (await request(app, second, `/api/drills/${firstDrill.id}`)).statusCode,
  ).toBe(404);
  expect(
    (
      await request(app, second, {
        method: "POST",
        url: `/api/drills/${firstDrill.id}/finish`,
        payload: {},
      })
    ).statusCode,
  ).toBe(404);

  const firstList = (await request(app, first, "/api/drills")).json();
  const secondList = (await request(app, second, "/api/drills")).json();
  expect(firstList.drills.map((drill) => drill.id)).toEqual([firstDrill.id]);
  expect(secondList.drills.map((drill) => drill.id)).toEqual([secondDrill.id]);
  expect(firstList.activeId).toBe(firstDrill.id);
  expect(secondList.activeId).toBe(secondDrill.id);
});

it("reattaches a known workspace and replaces an unknown credential", async () => {
  const h = harness();
  const app = await createApp(h.engine, { webRoot: "/missing" });
  cleanups.push(() => app.close());

  const created = await app.inject("/api/workspace");
  const workspace = cookie(created);
  const resumed = await request(app, workspace, "/api/workspace");
  expect(resumed.json()).toEqual({ ready: true });
  expect(resumed.headers["set-cookie"]).toBeUndefined();

  const replaced = await app.inject({
    url: "/api/workspace",
    headers: {
      cookie: "role_cast_workspace=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    },
  });
  expect(replaced.statusCode).toBe(200);
  expect(cookie(replaced)).not.toContain(
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  );
  const https = await app.inject({
    url: "/api/workspace",
    headers: {
      host: "role-cast.example.test",
      "x-forwarded-proto": "https",
    },
  });
  expect(https.headers["set-cookie"]).toContain("; Secure");
});

it("binds voice reservations and WebSocket attachment to the same workspace", async () => {
  const h = harness();
  const client = fakeLive();
  const app = await createApp(h.engine, {
    webRoot: "/missing",
    liveClient: client,
  });
  cleanups.push(() => app.close());
  await app.listen({ host: "127.0.0.1", port: 0 });
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const first = cookie(await app.inject("/api/workspace"));
  const second = cookie(await app.inject("/api/workspace"));

  const { id } = (
    await request(app, first, {
      method: "POST",
      url: "/api/drills",
      payload: { plotId: "anti-fraud" },
    })
  ).json();
  await until(
    () =>
      h.store.db.prepare("SELECT state FROM sessions WHERE id=?").get(id)
        .state === "awaiting_call",
  );
  const drill = (await request(app, first, `/api/drills/${id}`)).json();
  const { callId } = (
    await request(app, first, {
      method: "POST",
      url: `/api/drills/${id}/calls/accept`,
      headers: { origin },
      payload: {
        assignmentId: drill.pendingCall.assignmentId,
        mode: "voice",
      },
    })
  ).json();
  const voiceUrl = `/api/drills/${id}/calls/${callId}/voice`;
  const reservation = await request(app, first, {
    method: "POST",
    url: voiceUrl,
    headers: { origin },
    payload: { requestId: "first" },
  });
  expect(reservation.statusCode).toBe(201);
  expect(
    (
      await request(app, second, {
        method: "POST",
        url: voiceUrl,
        headers: { origin },
        payload: { requestId: "second" },
      })
    ).statusCode,
  ).toBe(404);

  const reserved = reservation.json();
  const socket = new WebSocket(
    `${origin.replace("http:", "ws:")}${voiceUrl}/${reserved.voiceId}`,
    { origin, headers: { cookie: second } },
  );
  await once(socket, "open");
  socket.send(JSON.stringify({ type: "attach", token: reserved.token }));
  await once(socket, "close");
  expect(client.connections).toHaveLength(0);
});

it("migrates an unscoped v4 database into the first private workspace", async () => {
  const directory = mkdtempSync(join(tmpdir(), "rolecast-workspaces-"));
  const path = join(directory, "v4.sqlite");
  const original = harness({}, path);
  const {
    id: _plotId,
    version: _plotVersion,
    ...definition
  } = original.store.getPlot("anti-fraud");
  const plot = original.store.createPlot({
    ...definition,
    name: "升級前劇本",
  });
  const drillId = original.engine.start(plot.id);
  await until(() => original.store.get(drillId).state === "awaiting_call");
  original.engine.dispose();
  original.store.db.pragma("foreign_keys = OFF");
  original.store.db.exec(`
    DROP INDEX one_active_session_per_workspace;
    ALTER TABLE sessions DROP COLUMN owner_id;
    CREATE UNIQUE INDEX one_active_session ON sessions((1))
      WHERE state NOT IN ('completed','failed','interrupted');
    CREATE TABLE plots_v4 (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
    INSERT INTO plots_v4(id,version,payload)
      SELECT id,version,payload FROM plots WHERE owner_id='default';
    DROP TABLE plots;
    ALTER TABLE plots_v4 RENAME TO plots;
    DROP TABLE workspaces;
    PRAGMA user_version=4;
  `);
  original.store.close();

  const store = new Store(path);
  const engine = new Engine(store, fixtureAgents());
  const app = await createApp(engine, { webRoot: "/missing" });
  cleanups.push(async () => {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const workspace = cookie(await app.inject("/api/workspace"));
  expect(
    (await request(app, workspace, "/api/plots"))
      .json()
      .map((item) => item.name),
  ).toContain("升級前劇本");
  expect(
    (await request(app, workspace, "/api/drills")).json().drills[0].id,
  ).toBe(drillId);
  expect(store.db.pragma("user_version", { simple: true })).toBe(6);
  expect(store.db.pragma("foreign_key_check")).toEqual([]);
});

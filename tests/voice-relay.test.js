import { afterEach, expect, it } from "vitest";
import { once } from "node:events";
import WebSocket from "ws";
import { createServer as createVite } from "vite";
import { createApp } from "../apps/server/src/app.js";
import { harness, ready, until } from "./support/fixtures.js";
import { fakeLive, transcript } from "./support/voice.js";
const cleanup = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
async function setup(resource = "sessions") {
  const h = harness(),
    client = fakeLive();
  const app = await createApp(h.engine, {
    webRoot: "/absent",
    liveClient: client,
    voiceOptions: { closeMs: 50, checkpointMs: 20 },
    frontendOrigins: ["http://127.0.0.1:5173"],
  });
  cleanup.push(() => app.close());
  await app.listen({ host: "127.0.0.1", port: 0 });
  const origin = `http://127.0.0.1:${app.server.address().port}`,
    { id, callId } = await ready(h);
  const url = `/api/${resource}/${id}/calls/${callId}/voice`;
  const reserve = (requestId, from = origin) =>
    app.inject({
      method: "POST",
      url,
      headers: { origin: from },
      payload: { requestId },
    });
  const connect = async (
    reservation,
    from = origin,
    base = origin,
    headers = {},
  ) => {
    const ws = new WebSocket(
      `${base.replace("http:", "ws:")}${url}/${reservation.voiceId}`,
      { origin: from, headers },
    );
    cleanup.push(() => ws.terminate());
    const messages = [];
    ws.on("message", (data, binary) =>
      messages.push(binary ? data : JSON.parse(data)),
    );
    await once(ws, "open");
    ws.send(JSON.stringify({ type: "attach", token: reservation.token }));
    await until(() => messages.some((m) => m.type === "ready"));
    return { ws, messages };
  };
  return { ...h, app, client, id, callId, origin, url, reserve, connect };
}
it.each(["drills", "sessions"])(
  "supports %s WebSocket upgrades, single ownership, ordered PCM and a secret-free public protocol",
  async (resource) => {
    const h = await setup(resource);
    expect(
      (await h.reserve("wrong-origin", "http://localhost:9999")).statusCode,
    ).toBe(403);
    const rejected = new WebSocket(
      `${h.origin.replace("http:", "ws:")}${h.url}/fake`,
      { origin: "https://attacker.test" },
    );
    await expect(once(rejected, "open")).rejects.toThrow(/403/);
    const r = (await h.reserve("one")).json(),
      { ws, messages } = await h.connect(r);
    expect((await h.reserve("two")).statusCode).toBe(409);
    const connection = h.client.connections[0];
    ws.send(Buffer.from([1, 0, 2, 0]));
    ws.send(Buffer.from([3, 0, 4, 0]));
    ws.send(JSON.stringify({ type: "mute", muted: true }));
    await until(
      () =>
        connection.inputs.length === 2 &&
        messages.some((m) => m.type === "muted"),
    );
    expect(Buffer.concat(connection.inputs)).toEqual(
      Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]),
    );
    connection.emit({
      ...transcript("自動保存", "user"),
      private: "PRIVATE_SENTINEL",
    });
    connection.emit({
      type: "session.updated",
      session: { instructions: "PRIVATE_SENTINEL" },
    });
    connection.emit({
      type: "session.output_audio.delta",
      delta: Buffer.from([8, 0, 9, 0]).toString("base64"),
    });
    await until(() => messages.some((m) => m.type === "checkpoint"));
    expect(messages.find(Buffer.isBuffer)).toEqual(Buffer.from([8, 0, 9, 0]));
    expect(JSON.stringify(messages)).not.toMatch(
      /PRIVATE_SENTINEL|private-provider|instructions|apiKey/,
    );
    ws.send(JSON.stringify({ type: "stop" }));
    await until(() => !h.app.voice.items.size);
    expect(h.engine.view(h.id).calls[0].inputMode).toBe("text");
    expect(h.store.get(h.id).messages.at(-1).text).toBe("自動保存");
  },
);
it("supports same-host HTTPS tunnels for voice without trusting a forwarded host", async () => {
  const h = await setup("drills");
  const origin = "https://rolecast.example.test";
  const spoofed = {
    origin,
    host: "localhost",
    "x-forwarded-host": "rolecast.example.test",
  };
  expect(
    (
      await h.app.inject({
        method: "POST",
        url: h.url,
        headers: spoofed,
        payload: { requestId: "spoof" },
      })
    ).statusCode,
  ).toBe(403);
  const rejected = new WebSocket(
    `${h.origin.replace("http:", "ws:")}${h.url}/fake`,
    { headers: spoofed },
  );
  await expect(once(rejected, "open")).rejects.toThrow(/403/);
  const headers = { host: "rolecast.example.test" };
  const response = await h.app.inject({
    method: "POST",
    url: h.url,
    headers: { ...headers, origin },
    payload: { requestId: "tunnel" },
  });
  expect(response.statusCode).toBe(201);
  const { ws } = await h.connect(response.json(), origin, h.origin, headers);
  ws.send(Buffer.alloc(1920));
  await until(() => h.client.connections[0].inputs.length === 1);
  ws.close();
});
it.each([
  Buffer.alloc(3),
  JSON.stringify({ type: "caption", speaker: "persona", text: "forged" }),
  "{broken",
])(
  "rejects malformed PCM/control frames without trusted evidence",
  async (packet) => {
    const h = await setup(),
      r = (await h.reserve("one")).json(),
      { ws } = await h.connect(r);
    ws.send(packet);
    await until(() => !h.app.voice.items.size);
    expect(h.store.get(h.id).messages).toHaveLength(1);
    expect(h.store.voice.get(h.id, r.voiceId).errorCode).toBe("VOICE_PROTOCOL");
  },
);
it("wrong-call and reused tokens cannot attach; tab loss closes provider before shutdown closes SQLite", async () => {
  const h = await setup(),
    r = (await h.reserve("one")).json();
  const bad = new WebSocket(
    `${h.origin.replace("http:", "ws:")}${h.url}/${r.voiceId}`,
    { origin: h.origin },
  );
  await once(bad, "open");
  bad.send(JSON.stringify({ type: "attach", token: "wrong" }));
  await once(bad, "close");
  expect(h.client.connections).toHaveLength(0);
  const { ws } = await h.connect(r);
  ws.terminate();
  await until(() => !h.app.voice.items.size);
  expect(h.client.connections[0].disconnected).toBe(true);
  expect(h.store.voice.get(h.id, r.voiceId).errorCode).toBe(
    "VOICE_UNAVAILABLE",
  );
});
it("Vite's configured WebSocket proxy passes attachment and PCM through to the app", async () => {
  const h = await setup();
  const vite = await createVite({
    configFile: "apps/web/vite.config.js",
    server: {
      port: 0,
      strictPort: false,
      proxy: { "/api": { target: h.origin, ws: true } },
    },
  });
  await vite.listen();
  cleanup.push(() => vite.close());
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const r = (await h.reserve("proxy")).json();
  const { ws } = await h.connect(r, "http://127.0.0.1:5173", base);
  ws.send(Buffer.alloc(1920));
  await until(() => h.client.connections[0].inputs.length === 1);
  ws.close();
});

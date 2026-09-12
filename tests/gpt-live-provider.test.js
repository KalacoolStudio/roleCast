import { afterEach, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { WebSocketServer } from "ws";
import { createGptLiveClient, decodeAudio } from "@role-cast/gpt-live";
import { liveConfig, started, finalEvent } from "./support/live.js";

const cleanup = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
  vi.unstubAllEnvs();
});

async function provider({
  httpStatus = 200,
  upgradeStatus,
  onCommand,
  hangHttp = false,
  hangUpgrade = false,
  httpBody,
} = {}) {
  const requests = [],
    upgrades = [],
    commands = [],
    sockets = new Set();
  const server = createServer(async (req, res) => {
    let text = "";
    for await (const part of req) text += part;
    requests.push({
      path: req.url,
      method: req.method,
      headers: req.headers,
      body: JSON.parse(text),
    });
    if (hangHttp) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write("{");
      return;
    }
    res.writeHead(httpStatus, { "Content-Type": "application/json" });
    res.end(
      httpBody ??
        JSON.stringify(
          httpStatus === 200
            ? {
                session: { id: started.session.id },
                transport: { type: "webrtc", sdp: "answer" },
              }
            : {
                error: {
                  message: liveConfig.apiKey,
                  type: "invalid_request_error",
                },
              },
        ),
    );
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    upgrades.push({ path: request.url, headers: request.headers });
    if (hangUpgrade) {
      // After HTTP hands off an upgrade, the fixture owns the raw socket.
      // Consume the client's FIN and close our half of an aborted handshake.
      socket.resume();
      socket.once("end", () => socket.end());
      return;
    }
    if (upgradeStatus) {
      socket.end(
        `HTTP/1.1 ${upgradeStatus} Rejected\r\nContent-Length: 0\r\n\r\n`,
      );
      return;
    }
    wss.handleUpgrade(request, socket, head, (peer) => {
      peer.on("error", () => {});
      peer.on("message", (data) => {
        const event = JSON.parse(data.toString());
        commands.push(event);
        if (onCommand) {
          onCommand(event, peer);
          return;
        }
        if (event.type === "session.start") peer.send(JSON.stringify(started));
        else if (event.type === "session.close")
          peer.send(JSON.stringify(finalEvent));
        else if (event.type === "session.input_audio.append")
          peer.send(
            JSON.stringify({
              type: "session.output_audio.delta",
              delta: event.audio,
            }),
          );
        else if (event.type.endsWith(".append"))
          peer.send(
            JSON.stringify({
              type: `${event.type}ed`,
              client_event_id: event.event_id,
            }),
          );
      });
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(async () => {
    for (const peer of wss.clients) peer.terminate();
    for (const socket of sockets) socket.destroy();
    wss.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const baseURL = `http://127.0.0.1:${server.address().port}/proxy/v1/`;
  const client = createGptLiveClient({ ...liveConfig, baseURL });
  return { client, baseURL, requests, upgrades, commands, sockets, wss };
}

it("uses the pinned SDK for primary authentication, startup, audio, commands and finalization", async () => {
  const h = await provider();
  const events = [];
  const c = await h.client.connectWebSocket(
    { instructions: "繁體中文", voice: "marin" },
    { onEvent: (e) => events.push(e) },
  );
  cleanup.push(() => c.disconnect());
  expect(h.upgrades[0].path).toBe("/proxy/v1/live/sessions");
  expect(h.upgrades[0].headers.authorization).toBe(
    `Bearer ${liveConfig.apiKey}`,
  );
  expect(h.commands[0]).toMatchObject({
    type: "session.start",
    session: {
      model: "gpt-live-1",
      instructions: "繁體中文",
      audio: { format: { type: "audio/pcm", rate: 24000 } },
    },
  });
  c.appendAudio(Buffer.from([1, 2, 3, 4]));
  await c.appendCommentary("backend result", { delegationId: null });
  expect(
    decodeAudio(
      events.find((e) => e.type === "session.output_audio.delta").delta,
    ),
  ).toEqual(Buffer.from([1, 2, 3, 4]));
  expect(await c.close()).toMatchObject({
    finalized: true,
    usage: { seconds: 12.5 },
  });
  expect(h.commands.filter((e) => e.type === "session.close")).toHaveLength(1);
});

it("creates WebRTC sessions through the SDK and encodes opaque sideband paths", async () => {
  const h = await provider();
  expect(await h.client.createWebRtcSession({ sdp: "offer" })).toEqual({
    sessionId: "live_opaque",
    sdp: "answer",
  });
  expect(h.requests[0]).toMatchObject({
    method: "POST",
    path: "/proxy/v1/live/sessions",
    headers: { authorization: `Bearer ${liveConfig.apiKey}` },
    body: {
      transport: { type: "webrtc", sdp: "offer" },
      session: {
        model: "gpt-live-1",
        store: false,
        delegation: { type: "client" },
      },
    },
  });
  expect(h.requests[0].body.session.audio.format).toBeUndefined();
  const c = await h.client.attach("live_id/slash?query#fragment%percent");
  c.disconnect();
  expect(h.upgrades[0].path).toBe(
    "/proxy/v1/live/sessions/live_id%2Fslash%3Fquery%23fragment%25percent/attach",
  );
  expect(h.commands).toEqual([]);
});

it("explicit settings win over SDK environment settings and disable SDK logging", async () => {
  const h = await provider();
  vi.stubEnv("OPENAI_API_KEY", "wrong-key");
  vi.stubEnv("OPENAI_BASE_URL", "https://invalid.example.test");
  vi.stubEnv("OPENAI_ORG_ID", "wrong-org");
  vi.stubEnv("OPENAI_PROJECT_ID", "wrong-project");
  vi.stubEnv(
    "OPENAI_CUSTOM_HEADERS",
    "Authorization: Bearer wrong-key\nX-Injected: unwanted",
  );
  vi.stubEnv("OPENAI_LOG", "debug");
  const logs = ["debug", "info", "warn", "error"].map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
  try {
    await h.client.createWebRtcSession({ sdp: "offer" });
    const c = await h.client.connectWebSocket();
    await c.close();
    expect(h.requests[0].headers.authorization).toBe(
      `Bearer ${liveConfig.apiKey}`,
    );
    expect(h.requests[0].headers["x-injected"]).toBeUndefined();
    expect(h.requests[0].headers["openai-organization"]).toBeUndefined();
    expect(h.requests[0].headers["openai-project"]).toBeUndefined();
    logs.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  } finally {
    logs.forEach((spy) => spy.mockRestore());
  }
});

it.each([401, 403, 429, 503])(
  "classifies real HTTP %i without retries or leaking response bodies",
  async (status) => {
    const h = await provider({ httpStatus: status });
    let error;
    try {
      await h.client.createWebRtcSession({ sdp: "offer" });
    } catch (failure) {
      error = failure;
    }
    expect(error.status).toBe(status);
    expect(error.message + JSON.stringify(error)).not.toContain(
      liveConfig.apiKey,
    );
    expect(h.requests).toHaveLength(1);
  },
);

it.each([
  [401, "LIVE_AUTH"],
  [429, "LIVE_RATE_LIMIT"],
  [503, "LIVE_UNAVAILABLE"],
])(
  "classifies WebSocket handshake HTTP %i and never reconnects",
  async (status, code) => {
    const h = await provider({ upgradeStatus: status });
    await expect(h.client.connectWebSocket()).rejects.toMatchObject({
      code,
      status,
    });
    expect(h.upgrades).toHaveLength(1);
  },
);

it.each(["null", "[]", "invalid-json", '{"type":7}'])(
  "rejects malformed frames safely: %s",
  async (frame) => {
    const h = await provider({ onCommand: (_event, peer) => peer.send(frame) });
    await expect(h.client.connectWebSocket()).rejects.toMatchObject({
      code: "LIVE_PROTOCOL",
    });
    expect(h.upgrades).toHaveLength(1);
  },
);

it("rejects binary protocol frames and sanitizes an API error during startup", async () => {
  const binary = await provider({
    onCommand: (_event, peer) => peer.send(Buffer.from([1, 2])),
  });
  await expect(binary.client.connectWebSocket()).rejects.toMatchObject({
    code: "LIVE_PROTOCOL",
  });
  const apiError = await provider({
    onCommand: (_event, peer) =>
      peer.send(
        JSON.stringify({
          type: "error",
          error: { type: "authentication_error", message: liveConfig.apiKey },
        }),
      ),
  });
  await expect(apiError.client.connectWebSocket()).rejects.toMatchObject({
    code: "LIVE_AUTH",
  });
});

it("bounds an HTTP response body that never finishes", async () => {
  const h = await provider({ hangHttp: true });
  const c = createGptLiveClient({
    ...liveConfig,
    baseURL: h.baseURL,
    requestTimeoutMs: 100,
  });
  await expect(c.createWebRtcSession({ sdp: "offer" })).rejects.toMatchObject({
    code: "LIVE_TIMEOUT",
  });
  expect(h.requests).toHaveLength(1);
});

it("classifies malformed HTTP success JSON without exposing its contents", async () => {
  const h = await provider({ httpBody: liveConfig.apiKey });
  await expect(
    h.client.createWebRtcSession({ sdp: "offer" }),
  ).rejects.toMatchObject({
    code: "LIVE_PROTOCOL",
    message: expect.not.stringContaining(liveConfig.apiKey),
  });
});

it("aborts an unfinished WebSocket handshake and a running session after transport loss", async () => {
  const hanging = await provider({ hangUpgrade: true });
  const controller = new AbortController();
  const pending = hanging.client.connectWebSocket(
    {},
    { signal: controller.signal },
  );
  await vi.waitFor(() => expect(hanging.upgrades).toHaveLength(1));
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: "LIVE_CANCELLED" });
  await vi.waitFor(() => expect(hanging.sockets.size).toBe(0));
  const h = await provider();
  const c = await h.client.connectWebSocket();
  for (const peer of h.wss.clients) peer.terminate();
  await expect(c.closed).rejects.toMatchObject({
    code: "LIVE_FINALIZATION",
    finalized: false,
  });
  expect(h.upgrades).toHaveLength(1);
});

it("can import and construct without network access, env loading or storage imports", () => {
  const script = `
    import {syncBuiltinESMExports} from 'node:module';
    import net from 'node:net';
    import fs from 'node:fs';
    const read = fs.readFileSync;
    fs.readFileSync = function(path, ...args) {
      if (String(path).endsWith('.env')) throw new Error('env accessed');
      return read.call(this, path, ...args);
    };
    net.Socket.prototype.connect = () => { throw new Error('network accessed'); };
    globalThis.fetch = () => { throw new Error('network accessed'); };
    syncBuiltinESMExports();
    const {createGptLiveClient} = await import('@role-cast/gpt-live');
    createGptLiveClient({apiKey:'test'});
  `;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    { encoding: "utf8", env: { PATH: process.env.PATH } },
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

import { afterEach, expect, it, vi } from "vitest";
import { APIConnectionTimeoutError, APIUserAbortError } from "openai";
import {
  createGptLiveClient,
  decodeAudio,
  GptLiveError,
} from "@role-cast/gpt-live";
import {
  liveHarness,
  liveConfig,
  started,
  finalEvent,
} from "./support/live.js";

const cleanup = [];
afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach((fn) => fn());
  vi.useRealTimers();
});
async function ready(config, options) {
  const h = liveHarness(config, options);
  const events = [];
  const connection = await h.client.connectWebSocket(
    {},
    { onEvent: (e) => events.push(e) },
  );
  cleanup.push(() => connection.disconnect());
  return { ...h, connection, socket: h.sockets[0], events };
}

it.each([
  [APIConnectionTimeoutError, "LIVE_TIMEOUT"],
  [APIUserAbortError, "LIVE_CANCELLED"],
])(
  "classifies SDK exception classes whose name remains Error",
  async (ErrorClass, code) => {
    const failure = new ErrorClass({ message: liveConfig.apiKey });
    expect(failure.name).toBe("Error");
    const h = liveHarness(
      {},
      {
        create: async () => {
          throw failure;
        },
      },
    );
    await expect(
      h.client.createWebRtcSession({ sdp: "offer" }),
    ).rejects.toMatchObject({
      code,
      message: expect.not.stringContaining(liveConfig.apiKey),
    });
  },
);

it("constructs an isolated client lazily and snapshots default session configuration", async () => {
  const h = liveHarness();
  expect(h.sdkConfigs).toEqual([]);
  expect(Object.keys(h.client)).toEqual([
    "connectWebSocket",
    "attach",
    "createWebRtcSession",
  ]);
  const c = await h.client.connectWebSocket();
  cleanup.push(() => c.disconnect());
  expect(h.sockets[0].sent[0]).toMatchObject({
    type: "session.start",
    session: {
      model: "gpt-live-1",
      input: [],
      delegation: { type: "client" },
      store: false,
      audio: {
        format: { type: "audio/pcm", rate: 24000 },
        output: { voice: "marin" },
      },
    },
  });
  expect(JSON.stringify(h.client)).not.toContain(liveConfig.apiKey);
});

it.each([
  { apiKey: "" },
  { apiKey: "key\r\nvalue" },
  { baseURL: "bad" },
  { baseURL: "https://user:password@example.test/v1" },
  { baseURL: "https://example.test/v1?key=secret" },
  { baseURL: "https://example.test/#secret" },
  { baseURL: "http://example.test/v1" },
  { connectTimeoutMs: 0 },
  { closeTimeoutMs: Infinity },
  { commandTimeoutMs: -1 },
  { maxBufferedBytes: 1.5 },
  { maxPendingCommands: 0 },
  { requestTimeoutMs: 2147483648 },
])("rejects invalid client settings before networking: %j", (patch) => {
  expect(() => createGptLiveClient({ ...liveConfig, ...patch })).toThrow(
    GptLiveError,
  );
});

it.each([
  { model: "other" },
  { instructions: 7 },
  { input: [{ role: "system", content: "x" }] },
  { input: [{ role: "user", content: [{ type: "input_audio", text: "x" }] }] },
  { voice: " " },
  { store: "true" },
  { delegation: { type: "responses" } },
  { delegation: { type: "responses", responses: { model: "" } } },
  { delegation: { type: "client", responses: { model: "x" } } },
  {
    delegation: {
      type: "responses",
      responses: { model: "x", max_output_tokens: 2 },
    },
  },
])("rejects invalid session settings locally: %j", async (settings) => {
  const h = liveHarness();
  await expect(h.client.connectWebSocket(settings)).rejects.toMatchObject({
    code: "LIVE_CONFIG",
  });
  expect(h.sockets).toHaveLength(0);
  expect(h.sdkConfigs).toHaveLength(0);
});

it("uses explicit Responses delegation with independent history, voice and backend model", async () => {
  const h = liveHarness();
  const settings = {
    instructions: "繁體中文",
    voice: "quartz",
    input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
    delegation: {
      type: "responses",
      responses: {
        model: "backend-model",
        tools: [{ type: "web_search" }],
        max_output_tokens: 64,
      },
    },
  };
  const promise = h.client.connectWebSocket(settings);
  settings.input[0].content[0].text = "changed";
  const c = await promise;
  cleanup.push(() => c.disconnect());
  expect(h.sockets[0].sent[0].session).toMatchObject({
    model: "gpt-live-1",
    instructions: "繁體中文",
    input: [{ content: [{ text: "hello" }] }],
    delegation: { responses: { model: "backend-model" } },
    audio: { output: { voice: "quartz" } },
  });
});

it("waits for session.started and delivers events arriving before the connect promise resolves", async () => {
  const h = liveHarness({}, { autoStart: false });
  const events = [],
    resolved = vi.fn();
  const promise = h.client.connectWebSocket(
    {},
    { onEvent: (e) => events.push(e) },
  );
  promise.then(resolved);
  await Promise.resolve();
  expect(resolved).not.toHaveBeenCalled();
  const socket = h.sockets[0];
  expect(socket.sent.filter((e) => e.type === "session.start")).toHaveLength(1);
  socket.handlers.event(started);
  socket.handlers.event({
    type: "session.input_transcript.delta",
    delta: " hello ",
    start_ms: 0,
    end_ms: 1,
  });
  const c = await promise;
  cleanup.push(() => c.disconnect());
  expect(c.state).toBe("ready");
  expect(events.map((e) => e.type)).toEqual([
    "session.started",
    "session.input_transcript.delta",
  ]);
});

it("cancels startup without retrying and ignores a late session.started", async () => {
  const h = liveHarness({}, { autoStart: false }),
    controller = new AbortController();
  const events = [];
  const promise = h.client.connectWebSocket(
    {},
    { signal: controller.signal, onEvent: (e) => events.push(e) },
  );
  await Promise.resolve();
  controller.abort(new Error(liveConfig.apiKey));
  await expect(promise).rejects.toMatchObject({ code: "LIVE_CANCELLED" });
  expect(h.sockets[0].disposed).toBe(true);
  h.sockets[0].handlers.event(started);
  expect(events).toHaveLength(1);
  expect(JSON.stringify(events)).not.toContain(liveConfig.apiKey);
  expect(h.sockets).toHaveLength(1);
});

it("does not create SDK or sockets for pre-aborted operations", async () => {
  const h = liveHarness(),
    signal = AbortSignal.abort("private reason");
  await expect(h.client.connectWebSocket({}, { signal })).rejects.toMatchObject(
    { code: "LIVE_CANCELLED" },
  );
  await expect(h.client.attach("live_id", { signal })).rejects.toMatchObject({
    code: "LIVE_CANCELLED",
  });
  await expect(
    h.client.createWebRtcSession({ sdp: "offer" }, { signal }),
  ).rejects.toMatchObject({ code: "LIVE_CANCELLED" });
  expect(h.sdkConfigs).toEqual([]);
});

it("bounds startup and command waits and clears their timers", async () => {
  vi.useFakeTimers();
  const h = liveHarness({ connectTimeoutMs: 20 }, { autoStart: false });
  const promise = h.client.connectWebSocket();
  const rejection = expect(promise).rejects.toMatchObject({
    code: "LIVE_TIMEOUT",
  });
  await vi.advanceTimersByTimeAsync(20);
  await rejection;
  expect(h.sockets[0].disposed).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  const { connection } = await ready({ commandTimeoutMs: 20 });
  const command = expect(connection.muteInput()).rejects.toMatchObject({
    code: "LIVE_TIMEOUT",
  });
  await vi.advanceTimersByTimeAsync(20);
  await command;
  expect(connection.state).toBe("ready");
  expect(vi.getTimerCount()).toBe(0);
});

it("exchanges WebRTC offers with no PCM format and projects only ID and answer", async () => {
  const h = liveHarness(
    {},
    {
      create: () => ({
        session: { id: "opaque/custom", apiKey: liveConfig.apiKey },
        transport: { type: "webrtc", sdp: "answer" },
        extra: liveConfig.apiKey,
      }),
    },
  );
  expect(await h.client.createWebRtcSession({ sdp: "offer" })).toEqual({
    sessionId: "opaque/custom",
    sdp: "answer",
  });
  expect(h.requests[0].body).toMatchObject({
    session: { model: "gpt-live-1" },
    transport: { type: "webrtc", sdp: "offer" },
  });
  expect(h.requests[0].body.session.audio.format).toBeUndefined();
  expect(h.requests[0].options.maxRetries).toBe(0);
});

it.each([
  null,
  {},
  { session: { id: "id" }, transport: { type: "webrtc", sdp: "" } },
  { session: { id: "" }, transport: { type: "webrtc", sdp: "answer" } },
])("rejects a malformed WebRTC success response", async (response) => {
  const h = liveHarness({}, { create: () => response });
  await expect(
    h.client.createWebRtcSession({ sdp: "offer" }),
  ).rejects.toMatchObject({ code: "LIVE_PROTOCOL" });
});

it("rejects empty offers, invalid options, and invalid attachment IDs locally", async () => {
  const h = liveHarness();
  await expect(
    h.client.createWebRtcSession({ sdp: " " }),
  ).rejects.toMatchObject({ code: "LIVE_INPUT" });
  await expect(h.client.attach("")).rejects.toMatchObject({
    code: "LIVE_INPUT",
  });
  await expect(h.client.attach("id", { signal: {} })).rejects.toMatchObject({
    code: "LIVE_CONFIG",
    field: "signal",
  });
  await expect(
    h.client.connectWebSocket({}, { onEvent: true }),
  ).rejects.toMatchObject({ code: "LIVE_CONFIG", field: "onEvent" });
  expect(h.sdkConfigs).toHaveLength(0);
});

it("times out an HTTP request even if the injected transport ignores its signal", async () => {
  vi.useFakeTimers();
  const h = liveHarness(
    { requestTimeoutMs: 20 },
    { create: () => new Promise(() => {}) },
  );
  const promise = h.client.createWebRtcSession({ sdp: "offer" });
  const rejection = expect(promise).rejects.toMatchObject({
    code: "LIVE_TIMEOUT",
  });
  await vi.advanceTimersByTimeAsync(20);
  await rejection;
  expect(h.requests[0].options.signal.aborted).toBe(true);
  expect(h.requests).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("aborts pending HTTP work and ignores its late response", async () => {
  let resolve;
  const h = liveHarness(
    {},
    {
      create: () =>
        new Promise((r) => {
          resolve = r;
        }),
    },
  );
  const controller = new AbortController();
  const p = h.client.createWebRtcSession(
    { sdp: "offer" },
    { signal: controller.signal },
  );
  await Promise.resolve();
  controller.abort();
  await expect(p).rejects.toMatchObject({ code: "LIVE_CANCELLED" });
  resolve({
    session: { id: "late" },
    transport: { type: "webrtc", sdp: "late" },
  });
  expect(h.requests[0].options.signal.aborted).toBe(true);
});

it("attaches and disconnects a sideband without starting or ending the remote session", async () => {
  const h = liveHarness();
  const c = await h.client.attach("live/opaque?#%");
  const s = h.sockets[0];
  expect(s.parameters.sessionId).toBe("live/opaque?#%");
  expect(c.mode).toBe("sideband");
  expect(c.state).toBe("ready");
  expect(() => c.appendAudio(Buffer.alloc(2))).toThrow(/current state/);
  expect(() =>
    c.sendEvent({ type: "session.input_audio.append", audio: "AAA=" }),
  ).toThrow(/current state/);
  c.disconnect();
  expect(s.sent).toEqual([]);
  expect(s.disposed).toBe(true);
  await expect(c.closed).rejects.toMatchObject({
    code: "LIVE_FINALIZATION",
    finalized: false,
  });
});

it("round trips PCM bytes and rejects invalid audio and excessive buffering", async () => {
  const { connection, socket } = await ready({ maxBufferedBytes: 512 });
  const audio = Uint8Array.from([0, 1, 254, 255]);
  connection.appendAudio(audio);
  expect(decodeAudio(socket.sent[1].audio)).toEqual(Buffer.from(audio));
  for (const bad of ["AAA=", Buffer.alloc(0), Buffer.alloc(1)])
    expect(() => connection.appendAudio(bad)).toThrow(GptLiveError);
  for (const bad of ["", "bad?", "YQ==", "AA==", "AAB=", "AAA=\n"])
    expect(() => decodeAudio(bad)).toThrow(GptLiveError);
  socket.bufferedAmount = 500;
  expect(() => connection.appendAudio(audio)).toThrow(/buffer/);
  expect(socket.sent).toHaveLength(2);
  socket.bufferedAmount = 0;
  expect(() => connection.appendAudio(Buffer.alloc(1024))).toThrow(/buffer/);
});

it("preserves overlapping text, timing, unknown events, reflected audio and nested Responses envelopes", async () => {
  const { socket, events } = await ready();
  const incoming = [
    {
      type: "session.input_transcript.delta",
      delta: " 你好",
      start_ms: 10,
      end_ms: 30,
    },
    {
      type: "session.output_transcript.delta",
      delta: "喔 ",
      start_ms: 20,
      end_ms: 40,
    },
    {
      type: "session.delegation.created",
      offset_ms: 42,
      delegation: { id: "item_x", target: "client" },
    },
    {
      type: "response.event",
      delegation_id: "item_x",
      event: {
        type: "response.completed",
        response: { usage: { output_tokens: 7 } },
      },
    },
    { type: "session.input_audio.append", audio: "AAA=" },
    { type: "session.future", extra: true },
  ];
  incoming.forEach(socket.handlers.event);
  expect(events.slice(1)).toEqual(incoming);
});

it("correlates concurrent acknowledgments and passes caller delegation IDs unchanged", async () => {
  const { connection: c, socket } = await ready();
  const first = c.appendThinking("working", {
    delegationId: "item_opaque",
    eventId: "a",
  });
  const second = c.appendCommentary("done", {
    delegationId: "item_opaque",
    eventId: "b",
  });
  expect(socket.sent[1]).toMatchObject({
    type: "session.thinking.append",
    delegation_id: "item_opaque",
    content: "working",
    event_id: "a",
  });
  const settled = vi.fn();
  first.then(settled);
  socket.handlers.event({
    type: "session.commentary.appended",
    client_event_id: "b",
  });
  await expect(second).resolves.toMatchObject({ client_event_id: "b" });
  expect(settled).not.toHaveBeenCalled();
  socket.handlers.event({
    type: "session.commentary.appended",
    client_event_id: "a",
  });
  expect(settled).not.toHaveBeenCalled();
  socket.handlers.event({
    type: "session.thinking.appended",
    client_event_id: "a",
  });
  await first;
  expect(settled).toHaveBeenCalledOnce();
});

it("supports instructions, mute/unmute, and lower-level commands without auto-executing tools", async () => {
  const { connection: c, socket } = await ready({}, { autoAck: true });
  await c.appendInstructions("keep context");
  await c.muteInput();
  await c.unmuteInput();
  c.sendEvent({
    type: "response.item.create",
    item: { type: "function_call_output", call_id: "call_1", output: "ok" },
  });
  expect(socket.sent[1].delegation_id).toBeNull();
  expect(socket.sent.slice(1).map((e) => e.type)).toEqual([
    "session.instructions.append",
    "session.input_audio.mute",
    "session.input_audio.unmute",
    "response.item.create",
  ]);
  for (const type of ["session.start", "session.close"])
    expect(() => c.sendEvent({ type })).toThrow(GptLiveError);
});

it("isolates correlated command errors and sanitizes provider errors at every nesting level", async () => {
  const { connection: c, socket, events } = await ready();
  const a = c.muteInput({ eventId: "a" }),
    b = c.unmuteInput({ eventId: "b" });
  const err = {
    type: "invalid_request_error",
    message: liveConfig.apiKey,
    cause: { authorization: liveConfig.apiKey },
    client_event_id: "a",
  };
  socket.handlers.event({ type: "error", error: err });
  await expect(a).rejects.toMatchObject({ code: "LIVE_REQUEST" });
  socket.handlers.event({
    type: "error",
    error: { ...err, client_event_id: null },
  });
  socket.handlers.event({
    type: "response.event",
    delegation_id: "item_1",
    event: { type: "response.failed", response: { error: err } },
  });
  socket.handlers.event({
    type: "session.input_audio.unmuted",
    client_event_id: "b",
  });
  await expect(b).resolves.toBeDefined();
  expect(c.state).toBe("ready");
  expect(JSON.stringify(events)).not.toContain(liveConfig.apiKey);
  expect(events[1].error.cause).toBeUndefined();
});

it("sanitizes flat Responses errors while retaining the delegation envelope", async () => {
  const { socket, events } = await ready();
  socket.handlers.event({
    type: "response.event",
    event_id: "provider_1",
    delegation_id: "delegation_1",
    event: {
      type: "error",
      code: "rate_limit_exceeded",
      message: liveConfig.apiKey,
      param: liveConfig.apiKey,
      sequence_number: 4,
    },
  });
  expect(events.at(-1)).toMatchObject({
    type: "response.event",
    event_id: "provider_1",
    delegation_id: "delegation_1",
    event: {
      type: "error",
      sequence_number: 4,
      error: { code: "LIVE_RATE_LIMIT" },
    },
  });
  expect(JSON.stringify(events)).not.toContain(liveConfig.apiKey);
});

it("observes matching sideband startup notifications without restarting or reopening during close", async () => {
  const h = liveHarness();
  const events = [];
  const c = await h.client.attach(started.session.id, {
    onEvent: (event) => events.push(event),
  });
  cleanup.push(() => c.disconnect());
  const socket = h.sockets[0];
  socket.handlers.event(started);
  expect(c.state).toBe("ready");
  expect(events).toEqual([started]);
  expect(socket.sent).toEqual([]);
  const closing = c.close();
  socket.handlers.event(started);
  expect(c.state).toBe("closing");
  socket.handlers.event(finalEvent);
  await expect(closing).resolves.toMatchObject({ finalized: true });
});

it("bounds pending commands, rejects duplicate IDs, and removes cancelled waits", async () => {
  const { connection: c, socket } = await ready({ maxPendingCommands: 1 });
  const controller = new AbortController();
  const a = c.muteInput({ eventId: "a", signal: controller.signal });
  await expect(c.unmuteInput({ eventId: "a" })).rejects.toMatchObject({
    code: "LIVE_INPUT",
  });
  await expect(c.unmuteInput({ eventId: "b" })).rejects.toMatchObject({
    code: "LIVE_BACKPRESSURE",
  });
  controller.abort();
  await expect(a).rejects.toMatchObject({ code: "LIVE_CANCELLED" });
  const b = c.unmuteInput({ eventId: "b" });
  socket.handlers.event({
    type: "session.input_audio.muted",
    client_event_id: "a",
  });
  socket.handlers.event({
    type: "session.input_audio.unmuted",
    client_event_id: "b",
  });
  await b;
  expect(socket.sent.map((e) => e.type)).not.toContain("response.cancel");
});

it("shares close results, drains final events and rejects pending/new work", async () => {
  const { connection: c, socket, events } = await ready();
  const pending = c.muteInput();
  const a = c.close(),
    b = c.close();
  expect(a).toBe(b);
  await expect(pending).rejects.toMatchObject({ code: "LIVE_STATE" });
  expect(() => c.appendAudio(Buffer.alloc(2))).toThrow(GptLiveError);
  expect(socket.disposed).toBe(false);
  socket.handlers.event({
    type: "session.usage.updated",
    usage: { seconds: 9 },
  });
  socket.handlers.event(finalEvent);
  expect(await a).toEqual({
    finalized: true,
    sessionId: "live_opaque",
    reason: "close_requested",
    usage: { seconds: 12.5 },
  });
  expect(c.close()).toBe(a);
  expect(socket.sent.filter((e) => e.type === "session.close")).toHaveLength(1);
  expect(events.at(-1)).toEqual(finalEvent);
  expect(socket.disposed).toBe(true);
});

it("accepts a final event with an abnormal reason and never invalidates confirmed usage", async () => {
  const { connection: c, socket } = await ready();
  socket.handlers.event({ ...finalEvent, reason: "connection_lost" });
  socket.handlers.close();
  expect(await c.closed).toMatchObject({
    finalized: true,
    reason: "connection_lost",
  });
  expect(await c.close()).toMatchObject({ finalized: true });
  expect(socket.sent).toHaveLength(1);
});

it.each(["timeout", "abort", "loss"])(
  "reports incomplete finalization on %s and releases resources",
  async (kind) => {
    vi.useFakeTimers();
    const { connection: c, socket } = await ready({ closeTimeoutMs: 20 });
    socket.handlers.event({
      type: "session.usage.updated",
      usage: { seconds: 2 },
    });
    socket.handlers.event({
      type: "session.usage.updated",
      usage: { seconds: 4 },
    });
    const controller = new AbortController();
    const promise = c.close({ signal: controller.signal });
    const result = expect(promise).rejects.toMatchObject({
      code: "LIVE_FINALIZATION",
      finalized: false,
      latestUsage: { seconds: 4 },
    });
    if (kind === "timeout") await vi.advanceTimersByTimeAsync(20);
    else if (kind === "abort") controller.abort();
    else socket.handlers.close();
    await result;
    expect(socket.disposed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    socket.handlers.event(finalEvent);
    expect(c.state).toBe("failed");
  },
);

it("rejects malformed terminal events and callback failures without leaking thrown values", async () => {
  const { connection: c, socket } = await ready();
  socket.handlers.event({ ...finalEvent, usage: { seconds: "bad" } });
  await expect(c.closed).rejects.toMatchObject({
    failureCode: "LIVE_PROTOCOL",
  });
  const h = liveHarness();
  const other = await h.client.connectWebSocket(
    {},
    {
      onEvent: () => {
        throw new Error(liveConfig.apiKey);
      },
    },
  );
  await expect(other.closed).rejects.toMatchObject({
    failureCode: "LIVE_INPUT",
  });
  expect(h.sockets[0].disposed).toBe(true);
});

it.each([
  [401, "LIVE_AUTH"],
  [403, "LIVE_AUTH"],
  [400, "LIVE_REQUEST"],
  [429, "LIVE_RATE_LIMIT"],
  [503, "LIVE_UNAVAILABLE"],
])("normalizes HTTP %i with no retries or raw causes", async (status, code) => {
  const h = liveHarness(
    {},
    {
      create: () => {
        throw {
          status,
          message: liveConfig.apiKey,
          cause: { request: liveConfig.apiKey },
        };
      },
    },
  );
  let failure;
  try {
    await h.client.createWebRtcSession({ sdp: "offer" });
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({ code, status });
  expect(failure.message + JSON.stringify(failure)).not.toContain(
    liveConfig.apiKey,
  );
  expect(failure.cause).toBeUndefined();
  expect(h.requests).toHaveLength(1);
});

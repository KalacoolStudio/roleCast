import { afterEach, expect, it, vi } from "vitest";
import { Resampler, encodePCM, decodePCM } from "../apps/web/src/voice-pcm.js";
import { VoiceMedia } from "../apps/web/src/voice-media.js";
import { deferred } from "./support/fixtures.js";
const cleanup = [];
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn();
  vi.unstubAllGlobals();
});
async function worklet(rate) {
  let Processor;
  vi.stubGlobal("sampleRate", rate);
  vi.stubGlobal(
    "AudioWorkletProcessor",
    class {
      constructor() {
        this.port = {
          messages: [],
          postMessage(data) {
            this.messages.push(data);
          },
        };
      }
    },
  );
  vi.stubGlobal("registerProcessor", (_name, Type) => {
    Processor = Type;
  });
  vi.resetModules();
  await import("../apps/web/src/voice-worklet.js");
  const instance = new Processor(),
    post = instance.port.postMessage.bind(instance.port);
  instance.port.postMessage = (data) => {
    post(data);
    if (data.type === "audio")
      instance.port.onmessage({ data: { type: "capture-received" } });
  };
  return instance;
}
it.each([24000, 44100, 48000])(
  "captures continuous %i Hz audio as ordered PCM16LE 24 kHz without microphone monitoring",
  async (rate) => {
    const processor = await worklet(rate);
    processor.port.onmessage({ data: { type: "active", active: true } });
    const signal = Float32Array.from(
      { length: rate },
      (_, i) => Math.sin((2 * Math.PI * 220 * i) / rate) * 0.6,
    );
    for (let i = 0; i < signal.length; i += 128) {
      const output = new Float32Array(128);
      processor.process([[signal.slice(i, i + 128)]], [[output]]);
      expect(output.every((v) => v === 0)).toBe(true);
    }
    const packets = processor.port.messages.filter((m) => m.type === "audio");
    expect(packets.every((p) => p.bytes.byteLength === 1920)).toBe(true);
    const samples = packets.flatMap((p) => [...decodePCM(p.bytes)]);
    expect(samples.length).toBeGreaterThanOrEqual(23040);
    const expected = [...new Resampler(rate).push(signal)].slice(
      0,
      samples.length,
    );
    expect(
      Math.max(...samples.map((v, i) => Math.abs(v - expected[i]))),
    ).toBeLessThan(0.0001);
    processor.port.onmessage({ data: { type: "mute", muted: true } });
    processor.port.messages = [];
    for (let i = 0; i < rate / 128; i++)
      processor.process([[signal.slice(0, 128)]], [[new Float32Array(128)]]);
    expect(
      processor.port.messages.every((m) =>
        [...new Uint8Array(m.bytes)].every((b) => b === 0),
      ),
    ).toBe(true);
  },
);
it("PCM clamps values and encodes signed little-endian samples", () => {
  expect([
    ...new Uint8Array(encodePCM(Float32Array.from([-2, -0.5, 0, 0.5, 2, NaN]))),
  ]).toEqual([0, 128, 0, 192, 0, 0, 0, 64, 255, 127, 0, 0]);
  expect(() => decodePCM(new ArrayBuffer(3))).toThrow();
});
it("a stalled main thread cannot build more than 480 ms of captured audio in the worklet port", async () => {
  const p = await worklet(24000);
  p.port.postMessage = (data) => p.port.messages.push(data);
  p.port.onmessage({ data: { type: "active", active: true } });
  for (let i = 0; i < 300; i++)
    p.process([[new Float32Array(128)]], [[new Float32Array(128)]]);
  expect(p.port.messages.filter((m) => m.type === "audio")).toHaveLength(12);
  expect(p.port.messages.at(-1)).toEqual({
    type: "error",
    code: "VOICE_BACKPRESSURE",
  });
  expect(p.active).toBe(false);
});
it.each([24000, 44100, 48000])(
  "plays ordered resampled output at %i Hz while capture continues, clears immediately, and rejects overflow",
  async (rate) => {
    const p = await worklet(rate);
    p.port.onmessage({ data: { type: "active", active: true } });
    const source = Float32Array.from(
      { length: 1920 },
      (_, i) => Math.sin(i / 50) * 0.5,
    );
    for (const chunk of [source.slice(0, 960), source.slice(960)])
      p.port.onmessage({ data: { type: "audio", bytes: encodePCM(chunk) } });
    const output = [];
    for (let i = 0; i < Math.floor((rate * 0.06) / 128); i++) {
      const block = new Float32Array(128);
      p.process([[new Float32Array(128).fill(0.3)]], [[block]]);
      output.push(...block);
    }
    const expected = new Resampler(24000, rate).push(
      decodePCM(encodePCM(source)),
    );
    expect(
      Math.max(...output.map((v, i) => Math.abs(v - expected[i]))),
    ).toBeLessThan(0.0001);
    expect(p.port.messages.some((m) => m.type === "audio")).toBe(true);
    p.port.onmessage({ data: { type: "clear" } });
    const clear = new Float32Array(128);
    p.process([[new Float32Array(128)]], [[clear]]);
    expect(clear.every((v) => v === 0)).toBe(true);
    p.port.onmessage({ data: { type: "active", active: true } });
    p.port.onmessage({
      data: { type: "audio", bytes: encodePCM(new Float32Array(8000)) },
    });
    expect(p.port.messages.at(-1)).toEqual({
      type: "error",
      code: "VOICE_BACKPRESSURE",
    });
  },
);
function browser({ permission, moduleFailure, requestFailure } = {}) {
  const track = { enabled: true, stop: vi.fn() },
    stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const ports = [],
    contexts = [],
    sockets = [],
    updates = [],
    events = [],
    request = vi.fn(async () => {
      if (requestFailure) throw new Error("失敗");
      return { voiceId: "attempt", token: "ONE_USE_TOKEN" };
    });
  class Context {
    constructor() {
      this.state = "running";
      this.destination = {};
      this.audioWorklet = {
        addModule: async () => {
          if (moduleFailure) throw new Error("module");
        },
      };
      contexts.push(this);
    }
    async resume() {}
    async close() {
      this.state = "closed";
    }
    createMediaStreamSource() {
      return { connect: vi.fn(), disconnect: vi.fn() };
    }
  }
  class Node {
    constructor() {
      this.port = { postMessage: vi.fn(), close: vi.fn() };
      ports.push(this.port);
    }
    connect() {}
    disconnect() {}
  }
  class Socket {
    constructor(url) {
      this.url = String(url);
      this.readyState = 1;
      this.bufferedAmount = 0;
      this.sent = [];
      sockets.push(this);
    }
    send(data) {
      this.sent.push(data);
    }
    close() {
      this.readyState = 3;
    }
  }
  const media = new VoiceMedia({
    workletUrl: "worklet.js",
    request,
    onState: (v) => updates.push(v),
    onEvent: (e) => events.push(e),
    env: {
      navigator: {
        mediaDevices: {
          getUserMedia: () =>
            permission ? permission(stream) : Promise.resolve(stream),
        },
      },
      AudioContext: Context,
      AudioWorkletNode: Node,
      WebSocket: Socket,
      crypto,
      location: { href: "http://localhost/" },
    },
  });
  cleanup.push(() => media.stop());
  const emit = (event) =>
    sockets[0].onmessage({
      data: JSON.stringify({ voiceId: "attempt", sequence: 1, ...event }),
    });
  return {
    media,
    track,
    ports,
    contexts,
    sockets,
    updates,
    request,
    emit,
    events,
  };
}
it("prepares permission/audio before reserving, ignores stale events, and releases all resources on stop", async () => {
  const b = browser();
  await b.media.prepare();
  expect(b.request).not.toHaveBeenCalled();
  await b.media.connect("session", "call");
  b.sockets[0].onopen();
  expect(b.sockets[0].url).not.toContain("ONE_USE_TOKEN");
  expect(JSON.parse(b.sockets[0].sent[0])).toEqual({
    type: "attach",
    token: "ONE_USE_TOKEN",
  });
  b.emit({ type: "ready" });
  b.media.mute();
  expect(b.track.enabled).toBe(false);
  b.emit({ type: "muted", muted: true, sequence: 2 });
  b.media.mute();
  expect(b.track.enabled).toBe(false);
  b.emit({ type: "muted", muted: false, sequence: 3 });
  expect(b.track.enabled).toBe(true);
  b.emit({ type: "caption", voiceId: "old", sequence: 99, fragment: {} });
  expect(b.events).toHaveLength(0);
  b.media.stop();
  b.emit({ type: "caption", sequence: 4, fragment: {} });
  expect(b.track.stop).toHaveBeenCalledOnce();
  expect(b.contexts[0].state).toBe("closed");
  expect(b.ports[0].close).toHaveBeenCalledOnce();
  expect(b.events).toHaveLength(0);
  expect(b.sockets[0].readyState).toBe(3);
});
it.each([
  "permission",
  "module",
  "reservation",
  "suspended",
  "track-ended",
  "backpressure",
])("cleans up partial startup or active audio failure: %s", async (failure) => {
  const b = browser({
    permission:
      failure === "permission"
        ? () => Promise.reject({ name: "NotAllowedError" })
        : undefined,
    moduleFailure: failure === "module",
    requestFailure: failure === "reservation",
  });
  if (["permission", "module"].includes(failure))
    await expect(b.media.prepare()).rejects.toBeDefined();
  else {
    await b.media.prepare();
    if (failure === "reservation")
      await expect(b.media.connect("s", "c")).rejects.toThrow();
    else {
      await b.media.connect("s", "c");
      b.sockets[0].onopen();
      b.emit({ type: "ready" });
      if (failure === "suspended") {
        b.contexts[0].state = "suspended";
        b.contexts[0].onstatechange();
      }
      if (failure === "track-ended") b.track.onended();
      if (failure === "backpressure") {
        b.sockets[0].bufferedAmount = 24000;
        b.ports[0].onmessage({
          data: { type: "audio", bytes: new ArrayBuffer(1920) },
        });
      }
    }
  }
  expect(b.media.closed).toBe(true);
  expect(b.contexts[0].state).toBe("closed");
  expect(b.updates.at(-1).error).toBeTruthy();
  if (failure !== "permission") expect(b.track.stop).toHaveBeenCalledOnce();
});
it("cancelled permission acquisition stops tracks that arrive later and never reserves a provider", async () => {
  const gate = deferred(),
    b = browser({ permission: (stream) => gate.promise.then(() => stream) });
  const preparing = b.media.prepare();
  await Promise.resolve();
  b.media.stop();
  gate.resolve();
  await expect(preparing).rejects.toThrow("Cancelled");
  expect(b.track.stop).toHaveBeenCalledOnce();
  expect(b.request).not.toHaveBeenCalled();
});

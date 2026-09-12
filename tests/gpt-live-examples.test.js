import { afterEach, expect, it } from "vitest";
import { withWebSocketVoice } from "../packages/gpt-live/examples/websocket.js";
import { withSideband } from "../packages/gpt-live/examples/webrtc.js";
import { liveHarness, finalEvent } from "./support/live.js";

const cleanup = [];
afterEach(() => cleanup.splice(0).forEach((fn) => fn()));

function autoFinalize(harness) {
  const socket = harness.sockets[0];
  const send = socket.send.bind(socket);
  socket.send = (event) => {
    send(event);
    if (event.type === "session.close")
      queueMicrotask(() => socket.handlers.event(finalEvent));
  };
  return socket;
}

it("runs the WebSocket example with audio, transcript and caller-owned delegation", async () => {
  const h = liveHarness({}, { autoAck: true });
  const audio = [],
    transcript = [],
    events = [];
  const result = await withWebSocketVoice(
    h.client,
    {
      onAudio: (pcm) => audio.push(pcm),
      onTranscript: (event) => transcript.push(event),
      onEvent: (event) => events.push(event),
    },
    async (connection) => {
      cleanup.push(() => connection.disconnect());
      const socket = autoFinalize(h);
      connection.appendAudio(Buffer.from([1, 2]));
      socket.handlers.event({
        type: "session.output_audio.delta",
        delta: "AQI=",
      });
      socket.handlers.event({
        type: "session.input_transcript.delta",
        delta: " Hi",
        start_ms: 0,
        end_ms: 10,
      });
      socket.handlers.event({
        type: "session.delegation.created",
        delegation: { id: "d_1", target: "client", offset_ms: 10 },
      });
      const delegation = events.at(-1).delegation;
      const runBackend = async (context) => `Context: ${context[0].delta}`;
      await connection.appendThinking(await runBackend(transcript), {
        delegationId: delegation.id,
      });
    },
  );
  expect(result).toMatchObject({ finalized: true, usage: { seconds: 12.5 } });
  expect(audio).toEqual([Buffer.from([1, 2])]);
  expect(transcript[0].delta).toBe(" Hi");
  expect(h.sockets[0].sent).toContainEqual(
    expect.objectContaining({
      type: "session.thinking.append",
      delegation_id: "d_1",
      content: "Context:  Hi",
    }),
  );
  expect(h.sockets[0].disposed).toBe(true);
});

it("closes the WebSocket example when caller interaction fails", async () => {
  const h = liveHarness();
  await expect(
    withWebSocketVoice(h.client, {}, async (connection) => {
      cleanup.push(() => connection.disconnect());
      autoFinalize(h);
      throw new Error("capture failed");
    }),
  ).rejects.toThrow("capture failed");
  expect(h.sockets[0].sent.at(-1).type).toBe("session.close");
  expect(h.sockets[0].disposed).toBe(true);
});

it("exchanges a WebRTC offer and detaches the example sideband without ending media", async () => {
  const h = liveHarness({}, { autoAck: true });
  const answer = await h.client.createWebRtcSession({ sdp: "offer" });
  expect(answer).toEqual({ sessionId: "live_opaque", sdp: "answer" });
  await expect(
    withSideband(h.client, answer.sessionId, {}, async (control) => {
      await control.muteInput();
      throw new Error("caller stopped observing");
    }),
  ).rejects.toThrow("caller stopped observing");
  expect(h.sockets[0].disposed).toBe(true);
  expect(h.sockets[0].sent.map((event) => event.type)).toEqual([
    "session.input_audio.mute",
  ]);
});

it("can explicitly finalize a remote WebRTC session from the example sideband", async () => {
  const h = liveHarness();
  const result = await withSideband(
    h.client,
    "live_opaque",
    {},
    async (control) => {
      autoFinalize(h);
      return control.close();
    },
  );
  expect(result.finalized).toBe(true);
  expect(h.sockets[0].sent.map((event) => event.type)).toEqual([
    "session.close",
  ]);
  expect(h.sockets[0].disposed).toBe(true);
});

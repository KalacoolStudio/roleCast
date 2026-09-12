import { deferred } from "./fixtures.js";

export const transcript = (delta, speaker = "user", start = 0, eventId) => ({
  type: `session.${speaker === "user" ? "input" : "output"}_transcript.delta`,
  delta,
  start_ms: start,
  end_ms: start + 40,
  ...(eventId ? { event_id: eventId } : {}),
});
export function fakeLive({ early = [], connect, close, greeting } = {}) {
  const connections = [];
  return {
    connections,
    async connectWebSocket(options, { onEvent, signal }) {
      const completion = deferred();
      const connection = {
        options,
        signal,
        sessionId: `private-provider-${connections.length}`,
        closed: completion.promise,
        inputs: [],
        instructions: [],
        thinking: [],
        mutes: [],
        disconnected: false,
        emit: onEvent,
        appendAudio(bytes) {
          this.inputs.push(Buffer.from(bytes));
        },
        async appendInstructions(text, args) {
          this.instructions.push({ text, args });
          greeting?.(this);
        },
        async appendThinking(text, args) {
          this.thinking.push({ text, args });
        },
        async muteInput() {
          this.mutes.push(true);
        },
        async unmuteInput() {
          this.mutes.push(false);
        },
        async close() {
          const result = close
            ? await close(this)
            : {
                finalized: true,
                reason: "client_closed",
                usage: { seconds: 1.25 },
              };
          completion.resolve(result);
          return result;
        },
        disconnect() {
          this.disconnected = true;
          completion.resolve({ finalized: false });
        },
      };
      connections.push(connection);
      for (const event of early) onEvent(event);
      if (connect) await connect(connection);
      return connection;
    },
  };
}
export function fakeSocket() {
  return {
    readyState: 1,
    bufferedAmount: 0,
    sent: [],
    send(data, callback) {
      this.sent.push(
        typeof data === "string" ? JSON.parse(data) : Buffer.from(data),
      );
      callback?.();
    },
    close() {
      this.readyState = 3;
    },
  };
}

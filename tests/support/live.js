import { createGptLiveClient } from "@role-cast/gpt-live";

export const liveConfig = {
  apiKey: "LIVE_SENTINEL_SECRET",
  connectTimeoutMs: 1000,
  commandTimeoutMs: 1000,
  closeTimeoutMs: 1000,
  requestTimeoutMs: 1000,
};
export const started = {
  type: "session.started",
  session: { id: "live_opaque", model: "gpt-live-1" },
};
export const finalEvent = {
  type: "session.closed",
  session: { id: "live_opaque", model: "gpt-live-1", status: "active" },
  reason: "close_requested",
  usage: { seconds: 12.5 },
};

export function liveHarness(
  config = {},
  { autoStart = true, autoAck = false, create } = {},
) {
  const sockets = [],
    requests = [],
    sdkConfigs = [];
  const client = createGptLiveClient(
    { ...liveConfig, ...config },
    {
      createSdk(settings) {
        sdkConfigs.push(settings);
        return {
          live: {
            create: async (body, options) => {
              requests.push({ body, options });
              return create
                ? create(body, options)
                : {
                    session: { id: "live_opaque" },
                    transport: { type: "webrtc", sdp: "answer" },
                  };
            },
          },
        };
      },
      openSocket(_sdk, parameters, handlers) {
        const socket = {
          parameters,
          handlers,
          sent: [],
          disposed: false,
          bufferedAmount: 0,
          send(event) {
            this.sent.push(event);
            if (event.type === "session.start" && autoStart)
              queueMicrotask(() => handlers.event(started));
            if (
              autoAck &&
              [
                "session.instructions.append",
                "session.thinking.append",
                "session.commentary.append",
                "session.input_audio.mute",
                "session.input_audio.unmute",
              ].includes(event.type)
            ) {
              const type = event.type.endsWith(".append")
                ? `${event.type}ed`
                : `${event.type}d`;
              queueMicrotask(() =>
                handlers.event({ type, client_event_id: event.event_id }),
              );
            }
          },
          dispose() {
            this.disposed = true;
          },
        };
        sockets.push(socket);
        queueMicrotask(handlers.open);
        return socket;
      },
    },
  );
  return { client, sockets, requests, sdkConfigs };
}

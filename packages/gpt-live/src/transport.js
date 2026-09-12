import OpenAI from "openai";
import { LiveWS } from "openai/resources/live/ws";
import { SidebandWS } from "openai/resources/live/sideband/ws";
import { GptLiveError } from "./errors.js";

export function createSdk(config) {
  const sdk = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    adminAPIKey: null,
    organization: null,
    project: null,
    webhookSecret: null,
    maxRetries: 0,
    timeout: config.requestTimeoutMs,
    logLevel: "off",
    fetchOptions: { redirect: "error" },
  });
  // SDK 7.15 merges OPENAI_CUSTOM_HEADERS even with explicit credentials.
  // This private client must use only configuration supplied to our constructor.
  sdk._options.defaultHeaders = {};
  return sdk;
}

/** SDK-owned authentication/connection, with a strict JSON event boundary. */
export function openSocket(sdk, { sessionId, connectTimeoutMs }, handlers) {
  const options = {
    reconnect: { maxRetries: 0 },
    maxQueueSize: 0,
    handshakeTimeout: connectTimeoutMs,
    maxPayload: 16 * 1024 * 1024,
  };
  const live =
    sessionId === undefined
      ? new LiveWS(sdk, options)
      : new SidebandWS(sdk, { session_id: sessionId }, options);
  const socket = live.socket.platformSocket;
  // Own parsing on this private socket: the pinned SDK accepts non-object JSON
  // and emits unbounded raw data. Our protocol contract rejects both safely.
  socket.removeAllListeners("message");
  socket.removeAllListeners("error");
  socket.removeAllListeners("open");
  socket.removeAllListeners("close");
  socket.on("open", handlers.open);
  socket.on("close", handlers.close);
  socket.on("error", handlers.error);
  socket.on("unexpected-response", (_request, response) => {
    handlers.error({ status: response.statusCode });
    response.destroy();
  });
  socket.on("message", (data, binary) => {
    let event;
    try {
      if (binary) throw new Error();
      event = JSON.parse(data.toString());
      if (
        !event ||
        Array.isArray(event) ||
        typeof event !== "object" ||
        typeof event.type !== "string" ||
        !event.type
      )
        throw new Error();
    } catch {
      handlers.error(new GptLiveError("LIVE_PROTOCOL"));
      return;
    }
    handlers.event(event);
  });
  return {
    get bufferedAmount() {
      return socket.bufferedAmount;
    },
    send(event) {
      if (socket.readyState !== 1) throw new GptLiveError("LIVE_STATE");
      socket.send(JSON.stringify(event), (error) => {
        if (error) handlers.error(error);
      });
    },
    dispose() {
      socket.removeAllListeners();
      // ws emits an error asynchronously if terminated during the handshake.
      if (socket.readyState !== 3) {
        socket.on("error", () => {});
        socket.once("close", () => socket.removeAllListeners());
        socket.terminate();
      }
    },
  };
}

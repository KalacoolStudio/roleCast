import {
  clientConfig,
  sessionConfig,
  operationOptions,
  sessionId,
  nonempty,
  object,
} from "./config.js";
import { createSdk, openSocket } from "./transport.js";
import { connect } from "./connection.js";
import { GptLiveError, normalizeError } from "./errors.js";

/**
 * @param {object} config Explicit apiKey/baseURL and optional time/buffer limits.
 * @param {object} dependencies Optional createSdk(config), openSocket(sdk, options, handlers).
 * Transport handlers must fire asynchronously, after openSocket returns its handle.
 */
export function createGptLiveClient(config, dependencies = {}) {
  const settings = clientConfig(config);
  if (!object(dependencies))
    throw new GptLiveError("LIVE_CONFIG", { field: "dependencies" });
  const buildSdk = dependencies.createSdk ?? createSdk;
  const open = dependencies.openSocket ?? openSocket;
  if (typeof buildSdk !== "function" || typeof open !== "function")
    throw new GptLiveError("LIVE_CONFIG", { field: "dependencies" });
  let sdk;
  function getSdk() {
    try {
      return (sdk ??= buildSdk(settings));
    } catch (error) {
      throw normalizeError(error, "LIVE_CONFIG");
    }
  }
  return Object.freeze({
    async connectWebSocket(options = {}, operation = {}) {
      const session = sessionConfig(options, true);
      operationOptions(operation);
      return connect(
        settings,
        (params, handlers) => open(getSdk(), params, handlers),
        session,
        operation,
      );
    },
    async attach(id, operation = {}) {
      sessionId(id);
      operationOptions(operation);
      return connect(
        settings,
        (params, handlers) => open(getSdk(), params, handlers),
        undefined,
        operation,
        id,
      );
    },
    async createWebRtcSession(options, operation = {}) {
      if (!object(options) || !nonempty(options.sdp))
        throw new GptLiveError("LIVE_INPUT", { field: "sdp" });
      const { sdp, ...rest } = options;
      const session = sessionConfig(rest);
      const { signal } = operationOptions(operation);
      const response = await boundedRequest(
        (requestSignal) =>
          getSdk().live.create(
            {
              session,
              transport: { type: "webrtc", sdp },
            },
            {
              signal: requestSignal,
              maxRetries: 0,
              timeout: settings.requestTimeoutMs,
            },
          ),
        settings.requestTimeoutMs,
        signal,
      );
      if (
        !nonempty(response?.session?.id) ||
        response?.transport?.type !== "webrtc" ||
        !nonempty(response?.transport?.sdp)
      )
        throw new GptLiveError("LIVE_PROTOCOL");
      return { sessionId: response.session.id, sdp: response.transport.sdp };
    },
  });
}

function boundedRequest(run, timeoutMs, signal) {
  if (signal?.aborted)
    return Promise.reject(new GptLiveError("LIVE_CANCELLED"));
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(normalizeError(error));
      else resolve(value);
    }
    function cancel(code) {
      finish(new GptLiveError(code));
      controller.abort();
    }
    const onAbort = () => cancel("LIVE_CANCELLED");
    const timer = setTimeout(() => cancel("LIVE_TIMEOUT"), timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    Promise.resolve()
      .then(() => {
        if (!settled) return run(controller.signal);
      })
      .then(
        (value) => finish(null, value),
        (error) => finish(error),
      );
  });
}

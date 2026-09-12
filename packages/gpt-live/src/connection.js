import { randomUUID } from "node:crypto";
import { encodeAudio, decodeAudio } from "./audio.js";
import { operationOptions, nonempty, object } from "./config.js";
import {
  GptLiveError,
  normalizeError,
  sanitizeEvent,
  validUsage,
} from "./errors.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // A session may end before its caller begins awaiting finalization.
  promise.catch(() => {});
  return { promise, resolve, reject };
}

export function connect(config, makeSocket, session, options, attachedId) {
  const { signal, onEvent = () => {} } = operationOptions(options);
  if (signal?.aborted)
    return Promise.reject(new GptLiveError("LIVE_CANCELLED"));
  let state = "connecting",
    id = attachedId,
    transport,
    latestUsage;
  let startupTimer, closeTimer, closeSignal, onCloseAbort;
  const ready = deferred(),
    closed = deferred(),
    pending = new Map();
  const terminal = () => ["closed", "disconnected", "failed"].includes(state);
  const onStartupAbort = () => fail(new GptLiveError("LIVE_CANCELLED"));

  function clearStartup() {
    clearTimeout(startupTimer);
    signal?.removeEventListener("abort", onStartupAbort);
  }
  function clearPending(error) {
    for (const command of [...pending.values()]) command.settle(error);
  }
  function cleanup(error) {
    clearStartup();
    clearTimeout(closeTimer);
    closeSignal?.removeEventListener("abort", onCloseAbort);
    clearPending(error);
    const socket = transport;
    transport = undefined;
    socket?.dispose();
  }
  function publish(event) {
    try {
      const returned = onEvent(event);
      if (returned?.then)
        Promise.resolve(returned).catch(() => callbackFailed());
    } catch {
      callbackFailed();
    }
  }
  function callbackFailed() {
    fail(new GptLiveError("LIVE_INPUT", { field: "onEvent" }), false);
  }
  function fail(error, notify = true, disconnected = false) {
    if (terminal()) return;
    const wasReady = state === "ready" || state === "closing";
    const safe = normalizeError(error);
    const finalError = new GptLiveError("LIVE_FINALIZATION", {
      failureCode: safe.code,
      latestUsage,
    });
    state = disconnected ? "disconnected" : "failed";
    ready.reject(safe);
    closed.reject(finalError);
    cleanup(safe);
    if (notify) publish({ type: "error", error: wasReady ? finalError : safe });
  }
  function assertReady() {
    if (state !== "ready") throw new GptLiveError("LIVE_STATE");
  }
  function wire(event, lifecycle = false) {
    let size;
    try {
      size = Buffer.byteLength(JSON.stringify(event));
    } catch {
      throw new GptLiveError("LIVE_INPUT");
    }
    if (!transport) throw new GptLiveError("LIVE_STATE");
    if (!lifecycle && transport.bufferedAmount + size > config.maxBufferedBytes)
      throw new GptLiveError("LIVE_BACKPRESSURE");
    try {
      transport.send(event);
    } catch (error) {
      const safe = normalizeError(error);
      fail(safe);
      throw safe;
    }
  }
  function prepareEvent(event) {
    assertReady();
    if (
      !object(event) ||
      !nonempty(event.type) ||
      ["session.start", "session.close"].includes(event.type)
    )
      throw new GptLiveError("LIVE_INPUT");
    if (event.type === "session.input_audio.append") {
      if (attachedId !== undefined) throw new GptLiveError("LIVE_STATE");
      decodeAudio(event.audio);
    }
    const eventId = event.event_id ?? randomUUID();
    if (!nonempty(eventId)) throw new GptLiveError("LIVE_INPUT");
    if (pending.has(eventId)) throw new GptLiveError("LIVE_INPUT");
    try {
      return JSON.parse(
        JSON.stringify({ ...event, event_id: eventId }, (_key, value) => {
          if (
            ["function", "symbol", "bigint"].includes(typeof value) ||
            (typeof value === "number" && !Number.isFinite(value))
          )
            throw new Error();
          return value;
        }),
      );
    } catch {
      throw new GptLiveError("LIVE_INPUT");
    }
  }
  function request(event, acknowledgment, commandOptions = {}) {
    // Convenience commands always return a promise, including local validation errors.
    try {
      const { signal: commandSignal, eventId } =
        operationOptions(commandOptions);
      if (commandSignal?.aborted) throw new GptLiveError("LIVE_CANCELLED");
      const prepared = prepareEvent({ ...event, event_id: eventId });
      if (pending.size >= config.maxPendingCommands)
        throw new GptLiveError("LIVE_BACKPRESSURE");
      const waiting = deferred();
      const onAbort = () => settle(new GptLiveError("LIVE_CANCELLED"));
      const timer = setTimeout(
        () => settle(new GptLiveError("LIVE_TIMEOUT")),
        config.commandTimeoutMs,
      );
      function settle(error, result) {
        if (!pending.delete(prepared.event_id)) return;
        clearTimeout(timer);
        commandSignal?.removeEventListener("abort", onAbort);
        if (error) waiting.reject(error);
        else waiting.resolve(result);
      }
      pending.set(prepared.event_id, { acknowledgment, settle });
      commandSignal?.addEventListener("abort", onAbort, { once: true });
      try {
        wire(prepared);
      } catch (error) {
        settle(normalizeError(error));
      }
      return waiting.promise;
    } catch (error) {
      return Promise.reject(normalizeError(error, "LIVE_INPUT"));
    }
  }
  function append(kind, content, options = {}) {
    try {
      operationOptions(options);
      const { delegationId = null } = options;
      if (
        !nonempty(content) ||
        (delegationId !== null && !nonempty(delegationId))
      )
        throw new GptLiveError("LIVE_INPUT");
      return request(
        {
          type: `session.${kind}.append`,
          content,
          delegation_id: delegationId,
        },
        `session.${kind}.appended`,
        options,
      );
    } catch (error) {
      return Promise.reject(normalizeError(error, "LIVE_INPUT"));
    }
  }

  const connection = Object.freeze({
    get state() {
      return state;
    },
    get sessionId() {
      return id;
    },
    mode: attachedId === undefined ? "primary" : "sideband",
    closed: closed.promise,
    appendAudio(bytes) {
      assertReady();
      if (attachedId !== undefined) throw new GptLiveError("LIVE_STATE");
      // Check before allocating the base64 copy as well as before actual sending.
      if (
        bytes instanceof Uint8Array &&
        Math.ceil(bytes.byteLength / 3) * 4 > config.maxBufferedBytes
      )
        throw new GptLiveError("LIVE_BACKPRESSURE");
      return this.sendEvent({
        type: "session.input_audio.append",
        audio: encodeAudio(bytes),
      });
    },
    appendInstructions: (content, opts) =>
      append("instructions", content, opts),
    appendThinking: (content, opts) => append("thinking", content, opts),
    appendCommentary: (content, opts) => append("commentary", content, opts),
    muteInput: (opts) =>
      request(
        { type: "session.input_audio.mute" },
        "session.input_audio.muted",
        opts,
      ),
    unmuteInput: (opts) =>
      request(
        { type: "session.input_audio.unmute" },
        "session.input_audio.unmuted",
        opts,
      ),
    sendEvent(event) {
      const prepared = prepareEvent(event);
      wire(prepared);
      return prepared.event_id;
    },
    close(opts = {}) {
      if (terminal() || state === "closing") return closed.promise;
      try {
        assertReady();
        ({ signal: closeSignal } = operationOptions(opts));
        state = "closing";
        clearPending(new GptLiveError("LIVE_STATE"));
        onCloseAbort = () => fail(new GptLiveError("LIVE_CANCELLED"));
        if (closeSignal?.aborted) onCloseAbort();
        else {
          closeSignal?.addEventListener("abort", onCloseAbort, { once: true });
          closeTimer = setTimeout(
            () => fail(new GptLiveError("LIVE_TIMEOUT")),
            config.closeTimeoutMs,
          );
          wire({ type: "session.close", event_id: randomUUID() }, true);
        }
      } catch (error) {
        fail(normalizeError(error));
      }
      return closed.promise;
    },
    disconnect() {
      fail(new GptLiveError("LIVE_CANCELLED"), false, true);
    },
  });

  function receive(event) {
    if (terminal()) return;
    try {
      if (!object(event) || !nonempty(event.type))
        throw new GptLiveError("LIVE_PROTOCOL");
      const safeEvent = sanitizeEvent(event);
      if (event.type === "session.started") {
        if (
          !nonempty(event.session?.id) ||
          event.session.model !== "gpt-live-1" ||
          (attachedId !== undefined
            ? event.session.id !== attachedId
            : state !== "starting")
        )
          throw new GptLiveError("LIVE_PROTOCOL");
        if (attachedId === undefined) {
          id = event.session.id;
          state = "ready";
          clearStartup();
          ready.resolve(connection);
        }
      } else if (event.type === "session.closed") {
        if (
          !nonempty(event.session?.id) ||
          (id !== undefined && event.session.id !== id) ||
          !nonempty(event.reason) ||
          !validUsage(event.usage)
        )
          throw new GptLiveError("LIVE_PROTOCOL");
        id = event.session.id;
        state = "closed";
        ready.reject(new GptLiveError("LIVE_STATE"));
        closed.resolve(
          Object.freeze({
            finalized: true,
            sessionId: id,
            reason: event.reason,
            usage: Object.freeze({ seconds: event.usage.seconds }),
          }),
        );
        cleanup(new GptLiveError("LIVE_STATE"));
      } else if (event.type === "session.usage.updated") {
        if (!validUsage(event.usage)) throw new GptLiveError("LIVE_PROTOCOL");
        latestUsage = { seconds: event.usage.seconds };
      } else if (event.type === "error") {
        const error = normalizeError(event.error, "LIVE_REQUEST");
        if (state === "connecting" || state === "starting") {
          fail(error);
          return;
        }
        pending.get(event.error?.client_event_id)?.settle(error);
      } else {
        const command = pending.get(event.client_event_id);
        if (command?.acknowledgment === event.type)
          command.settle(null, safeEvent);
      }
      publish(safeEvent);
    } catch (error) {
      fail(normalizeError(error, "LIVE_PROTOCOL"));
    }
  }

  startupTimer = setTimeout(
    () => fail(new GptLiveError("LIVE_TIMEOUT")),
    config.connectTimeoutMs,
  );
  signal?.addEventListener("abort", onStartupAbort, { once: true });
  try {
    transport = makeSocket(
      { sessionId: attachedId, connectTimeoutMs: config.connectTimeoutMs },
      {
        open() {
          if (state !== "connecting") return;
          if (attachedId !== undefined) {
            state = "ready";
            clearStartup();
            ready.resolve(connection);
          } else {
            state = "starting";
            try {
              wire(
                { type: "session.start", event_id: randomUUID(), session },
                true,
              );
            } catch (error) {
              fail(error);
            }
          }
        },
        event: receive,
        error: (error) => fail(normalizeError(error)),
        close: () => fail(new GptLiveError("LIVE_UNAVAILABLE")),
      },
    );
    if (terminal()) {
      transport.dispose();
      transport = undefined;
    }
  } catch (error) {
    fail(normalizeError(error));
  }
  return ready.promise;
}

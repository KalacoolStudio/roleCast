import { APIConnectionTimeoutError, APIUserAbortError } from "openai";

const messages = {
  LIVE_CONFIG: "Invalid Live client or session configuration.",
  LIVE_INPUT: "Invalid Live command or audio input.",
  LIVE_AUTH: "Live API authentication failed.",
  LIVE_REQUEST: "The Live API rejected the request.",
  LIVE_RATE_LIMIT: "The Live API rate limit was reached.",
  LIVE_UNAVAILABLE: "The Live service or connection is unavailable.",
  LIVE_CANCELLED: "The local Live operation was cancelled.",
  LIVE_TIMEOUT: "The Live operation timed out.",
  LIVE_PROTOCOL: "The Live service returned an invalid payload.",
  LIVE_STATE:
    "The Live connection cannot accept this operation in its current state.",
  LIVE_BACKPRESSURE:
    "The Live connection buffer or pending command limit was reached.",
  LIVE_FINALIZATION: "Live session finalization was not confirmed.",
};

/** A safe public error. Raw SDK errors, bodies, headers and causes are omitted. */
export class GptLiveError extends Error {
  constructor(code, { status, field, failureCode, latestUsage } = {}) {
    const safeCode = Object.hasOwn(messages, code) ? code : "LIVE_UNAVAILABLE";
    super(messages[safeCode]);
    this.name = "GptLiveError";
    this.code = safeCode;
    if (Number.isInteger(status) && status >= 400 && status <= 599)
      this.status = status;
    // Field names must come from our validators, never provider-controlled text.
    if (fields.has(field)) this.field = field;
    if (safeCode === "LIVE_FINALIZATION") {
      this.finalized = false;
      if (Object.hasOwn(messages, failureCode)) this.failureCode = failureCode;
      if (validUsage(latestUsage))
        this.latestUsage = { seconds: latestUsage.seconds };
    }
  }
}

const fields = new Set([
  "config",
  "apiKey",
  "baseURL",
  "requestTimeoutMs",
  "connectTimeoutMs",
  "commandTimeoutMs",
  "closeTimeoutMs",
  "maxBufferedBytes",
  "maxPendingCommands",
  "session",
  "instructions",
  "input",
  "voice",
  "delegation",
  "store",
  "sdp",
  "sessionId",
  "signal",
  "onEvent",
  "dependencies",
]);

export function validUsage(usage) {
  return (
    typeof usage?.seconds === "number" &&
    Number.isFinite(usage.seconds) &&
    usage.seconds >= 0
  );
}

export function normalizeError(error, fallback = "LIVE_UNAVAILABLE") {
  if (error instanceof GptLiveError) return error;
  const status = error?.status ?? error?.statusCode;
  const type = error?.type ?? error?.error?.type;
  const providerCode = error?.code;
  let code = fallback;
  if (
    status === 401 ||
    status === 403 ||
    [
      "authentication_error",
      "permission_error",
      "permission_denied_error",
    ].includes(type) ||
    ["invalid_api_key", "permission_denied"].includes(providerCode)
  )
    code = "LIVE_AUTH";
  else if (
    status === 429 ||
    type === "rate_limit_error" ||
    providerCode === "rate_limit_exceeded"
  )
    code = "LIVE_RATE_LIMIT";
  else if (
    status >= 500 ||
    type === "server_error" ||
    providerCode === "server_error"
  )
    code = "LIVE_UNAVAILABLE";
  else if (status >= 400 || type === "invalid_request_error")
    code = "LIVE_REQUEST";
  else if (
    error instanceof APIUserAbortError ||
    ["AbortError", "APIUserAbortError"].includes(error?.name)
  )
    code = "LIVE_CANCELLED";
  else if (
    error instanceof APIConnectionTimeoutError ||
    ["TimeoutError", "APIConnectionTimeoutError"].includes(error?.name)
  )
    code = "LIVE_TIMEOUT";
  else if (error instanceof SyntaxError) code = "LIVE_PROTOCOL";
  return new GptLiveError(code, { status });
}

/** Strip error payloads at any nesting level, preserving other event fields. */
export function sanitizeEvent(value) {
  if (Array.isArray(value)) return value.map(sanitizeEvent);
  if (!value || typeof value !== "object") return value;
  // Responses streams also carry flat { type: "error", message, code, param }
  // events. Keep their dispatch type and sequence, never their raw error text.
  if (value.type === "error" && !Object.hasOwn(value, "error")) {
    return {
      type: "error",
      error: normalizeError(value, "LIVE_REQUEST"),
      ...(Number.isSafeInteger(value.sequence_number)
        ? { sequence_number: value.sequence_number }
        : {}),
    };
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === "error" && item != null
        ? normalizeError(item, "LIVE_REQUEST")
        : sanitizeEvent(item),
    ]),
  );
}

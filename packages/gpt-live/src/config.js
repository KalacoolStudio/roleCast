import { GptLiveError } from "./errors.js";

export const object = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);
export const nonempty = (value) =>
  typeof value === "string" && value.trim().length > 0;
const fail = (field) => {
  throw new GptLiveError("LIVE_CONFIG", { field });
};

export function clientConfig(config) {
  if (!object(config)) fail("config");
  if (!nonempty(config.apiKey) || /[\r\n]/.test(config.apiKey)) fail("apiKey");
  let url;
  try {
    url = new URL(config.baseURL ?? "https://api.openai.com/v1");
  } catch {
    fail("baseURL");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    )
  )
    fail("baseURL");
  const result = {
    apiKey: config.apiKey,
    baseURL: url.href.replace(/\/+$/, ""),
  };
  for (const [key, fallback] of Object.entries({
    requestTimeoutMs: 30000,
    connectTimeoutMs: 30000,
    commandTimeoutMs: 30000,
    closeTimeoutMs: 15000,
    maxBufferedBytes: 1024 * 1024,
    maxPendingCommands: 64,
  })) {
    const value = config[key] ?? fallback;
    if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647)
      fail(key);
    result[key] = value;
  }
  return Object.freeze(result);
}

export function operationOptions(options = {}) {
  if (!object(options)) throw new GptLiveError("LIVE_INPUT");
  const { signal, onEvent } = options;
  if (signal !== undefined && !(signal instanceof AbortSignal)) fail("signal");
  if (onEvent !== undefined && typeof onEvent !== "function") fail("onEvent");
  return options;
}

export function sessionConfig(options = {}, primary = false) {
  if (!object(options)) fail("session");
  const allowed = new Set([
    "instructions",
    "input",
    "voice",
    "delegation",
    "store",
  ]);
  if (Object.keys(options).some((key) => !allowed.has(key))) fail("session");
  const {
    instructions,
    input = [],
    voice = "marin",
    delegation = { type: "client" },
    store = false,
  } = options;
  if (instructions !== undefined && typeof instructions !== "string")
    fail("instructions");
  if (
    !nonempty(voice) &&
    !(object(voice) && nonempty(voice.id) && Object.keys(voice).length === 1)
  )
    fail("voice");
  if (typeof store !== "boolean") fail("store");
  if (!Array.isArray(input) || input.length > 128) fail("input");
  for (const item of input) {
    if (
      !object(item) ||
      !["developer", "user", "assistant"].includes(item.role) ||
      !Array.isArray(item.content) ||
      item.content.length !== 1 ||
      !object(item.content[0]) ||
      typeof item.content[0].text !== "string" ||
      (item.type !== undefined && item.type !== "message") ||
      (item.content[0].type !== undefined &&
        !(
          item.role === "assistant" ? ["text", "output_text"] : ["input_text"]
        ).includes(item.content[0].type))
    )
      fail("input");
  }
  if (!object(delegation) || !["client", "responses"].includes(delegation.type))
    fail("delegation");
  if (
    delegation.type === "client" &&
    Object.keys(delegation).some((key) => key !== "type")
  )
    fail("delegation");
  if (delegation.type === "responses") {
    const r = delegation.responses;
    const keys = new Set([
      "model",
      "instructions",
      "max_output_tokens",
      "parallel_tool_calls",
      "reasoning",
      "service_tier",
      "text",
      "tool_choice",
      "tools",
    ]);
    if (
      !object(r) ||
      !nonempty(r.model) ||
      Object.keys(r).some((key) => !keys.has(key)) ||
      Object.keys(delegation).some(
        (key) => !["type", "responses"].includes(key),
      )
    )
      fail("delegation");
    if (r.instructions != null && typeof r.instructions !== "string")
      fail("delegation");
    if (
      r.max_output_tokens != null &&
      (!Number.isSafeInteger(r.max_output_tokens) || r.max_output_tokens < 16)
    )
      fail("delegation");
    if (
      r.parallel_tool_calls != null &&
      typeof r.parallel_tool_calls !== "boolean"
    )
      fail("delegation");
    if (
      r.tools !== undefined &&
      (!Array.isArray(r.tools) ||
        r.tools.some(
          (tool) =>
            !object(tool) || !["function", "web_search"].includes(tool.type),
        ))
    )
      fail("delegation");
    for (const key of ["reasoning", "text"])
      if (r[key] != null && !object(r[key])) fail("delegation");
  }
  const result = {
    model: "gpt-live-1",
    input,
    delegation,
    store,
    ...(instructions !== undefined ? { instructions } : {}),
    audio: {
      ...(primary ? { format: { type: "audio/pcm", rate: 24000 } } : {}),
      output: { voice },
    },
  };
  // Snapshot caller-owned configuration and reject unserializable values locally.
  try {
    return JSON.parse(
      JSON.stringify(result, (_key, value) => {
        if (
          ["function", "symbol", "bigint"].includes(typeof value) ||
          (typeof value === "number" && !Number.isFinite(value))
        )
          fail("session");
        return value;
      }),
    );
  } catch {
    fail("session");
  }
}

export function sessionId(value) {
  if (!nonempty(value) || [".", ".."].includes(value))
    throw new GptLiveError("LIVE_INPUT", { field: "sessionId" });
  return value;
}

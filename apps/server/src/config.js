import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { createGptLiveClient } from "@role-cast/gpt-live";
export const root = fileURLToPath(new URL("../../../", import.meta.url));
export function verifyCloudStorage(config, mountInfo) {
  if (config.deploymentMode !== "gcp") return;
  const mounts = mountInfo ?? readFileSync("/proc/self/mountinfo", "utf8");
  if (
    !mounts.split("\n").some((line) => {
      const fields = line.split(" ");
      return fields[4] === "/data" && fields[5]?.split(",").includes("rw");
    })
  )
    throw new Error(
      "請檢查設定：DATABASE_PATH (persistent /data mount required)",
    );
}
export function readEnvironment(directory = root, env = process.env) {
  let file = {};
  try {
    file = parse(readFileSync(resolve(directory, ".env")));
  } catch (e) {
    if (e.code !== "ENOENT") throw new Error("無法讀取 .env。");
  }
  return { ...file, ...env };
}
export function loadConfig(directory = root, env = process.env) {
  const values = readEnvironment(directory, env);
  const apiKey = values.API_KEY?.trim() ? values.API_KEY : values.LLM_API_KEY;
  const invalid = ["LLM_BASE_URL", "LLM_MODEL"].filter(
    (key) => !values[key]?.trim(),
  );
  if (!apiKey?.trim()) invalid.unshift("API_KEY");
  try {
    const url = new URL(values.LLM_BASE_URL);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      invalid.push("LLM_BASE_URL");
  } catch {
    invalid.push("LLM_BASE_URL");
  }
  const outputMode = values.LLM_OUTPUT_MODE?.trim() || "auto";
  if (!["auto", "json_schema", "json_object", "text"].includes(outputMode))
    invalid.push("LLM_OUTPUT_MODE");
  const port = Number(values.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) invalid.push("PORT");
  const deploymentMode = values.DEPLOYMENT_MODE || "local";
  if (!["local", "gcp"].includes(deploymentMode))
    invalid.push("DEPLOYMENT_MODE");
  const host = values.HOST || "127.0.0.1";
  if (!isIP(host)) invalid.push("HOST");
  if (
    deploymentMode === "gcp" &&
    (!values.DATABASE_PATH ||
      !isAbsolute(values.DATABASE_PATH) ||
      resolve(values.DATABASE_PATH) !== "/data/role-cast.sqlite")
  )
    invalid.push("DATABASE_PATH");
  if (invalid.length)
    throw new Error(`請檢查設定：${[...new Set(invalid)].join(", ")}`);
  return {
    apiKey,
    baseURL: values.LLM_BASE_URL,
    model: values.LLM_MODEL,
    outputMode,
    port,
    host,
    deploymentMode,
    live: liveConfiguration(values),
    databasePath: resolve(
      directory,
      values.DATABASE_PATH || "./data/role-cast.sqlite",
    ),
  };
}

export function liveConfiguration(values) {
  if (!values.API_KEY?.trim())
    return { available: false, reason: "NOT_CONFIGURED" };
  try {
    const config = {
      apiKey: values.API_KEY,
      baseURL: values.OPENAI_BASE_URL || "https://api.openai.com/v1",
      maxBufferedBytes: 32768,
    };
    createGptLiveClient(config); // Validates locally; no SDK construction or network.
    const voice = values.LIVE_VOICE || "marin";
    if (typeof voice !== "string" || !voice.trim() || voice.length > 100)
      throw new Error();
    return { available: true, config, voice };
  } catch {
    return { available: false, reason: "INVALID_CONFIG" };
  }
}

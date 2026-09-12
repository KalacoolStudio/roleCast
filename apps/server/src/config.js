import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
export const root = fileURLToPath(new URL("../../../", import.meta.url));
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
  const invalid = ["LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL"].filter(
    (key) => !values[key]?.trim(),
  );
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
  if (invalid.length)
    throw new Error(`請檢查設定：${[...new Set(invalid)].join(", ")}`);
  return {
    apiKey: values.LLM_API_KEY,
    baseURL: values.LLM_BASE_URL,
    model: values.LLM_MODEL,
    outputMode,
    port,
    databasePath: resolve(
      directory,
      values.DATABASE_PATH || "./data/role-cast.sqlite",
    ),
  };
}

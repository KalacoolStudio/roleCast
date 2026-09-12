import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "../../apps/server/src/config.js";

async function requestJSON(url, options, fetcher) {
  const response = await fetcher(url, {
    ...options,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GCP request failed (${response.status})`);
  return response.json();
}
async function token(fetcher) {
  const data = await requestJSON(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } },
    fetcher,
  );
  if (typeof data.access_token !== "string" || !data.access_token)
    throw new Error("Runtime identity is unavailable");
  return data.access_token;
}
export async function runtimeEnvironment(config, destination, fetcher = fetch) {
  const secretNames = ["LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL"];
  for (const name of secretNames) {
    if (
      !/^projects\/[a-z0-9-]+\/secrets\/[A-Za-z0-9_-]+\/versions\/[1-9][0-9]*$/.test(
        config.secretVersions?.[name] || "",
      )
    )
      throw new Error(`Invalid secret version: ${name}`);
  }
  const accessToken = await token(fetcher);
  const values = {
    HOST: "0.0.0.0",
    PORT: "8080",
    DEPLOYMENT_MODE: "gcp",
    DATABASE_PATH: "/data/role-cast.sqlite",
  };
  for (const name of secretNames) {
    const data = await requestJSON(
      `https://secretmanager.googleapis.com/v1/${config.secretVersions[name]}:access`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      fetcher,
    );
    if (typeof data.payload?.data !== "string")
      throw new Error(`Secret is unavailable: ${name}`);
    const value = Buffer.from(data.payload.data, "base64").toString("utf8");
    if (!value.trim() || /[\r\n\0]/.test(value))
      throw new Error(`Invalid secret contents: ${name}`);
    values[name] = value;
  }
  loadConfig("/nonexistent", values);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    writeFileSync(
      temporary,
      Object.entries(values)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n") + "\n",
      { flag: "wx", mode: 0o600 },
    );
    chmodSync(temporary, 0o600);
    renameSync(temporary, destination);
  } finally {
    rmSync(temporary, { force: true });
  }
}
export async function uploadFile(path, bucket, object, fetcher = fetch) {
  if (
    !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket) ||
    !/^backups\/[A-Za-z0-9/_.-]+$/.test(object) ||
    object.includes("..")
  )
    throw new Error("Invalid backup destination");
  const body = readFileSync(path);
  const accessToken = await token(fetcher);
  const response = await requestJSON(
    `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&ifGenerationMatch=0&name=${encodeURIComponent(object)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
      },
      body,
    },
    fetcher,
  );
  if (
    String(response.size) !== String(body.length) ||
    response.md5Hash !== createHash("md5").update(body).digest("base64")
  )
    throw new Error("Backup upload verification failed");
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [command, first, second, third] = process.argv.slice(2);
  try {
    if (command === "env")
      await runtimeEnvironment(JSON.parse(readFileSync(first, "utf8")), second);
    else if (command === "upload") await uploadFile(first, second, third);
    else throw new Error("Unknown cloud operation");
    console.log("Cloud operation completed.");
  } catch {
    // Do not propagate response bodies, env values, provider errors, or bearer tokens.
    console.error(
      "Cloud operation failed; check configuration, IAM, secret versions, and connectivity.",
    );
    process.exitCode = 1;
  }
}

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { root } from "../../apps/server/src/config.js";

const image = process.argv[2];
if (!image || image.startsWith("-"))
  throw new Error("Supply the image to test");
const suffix = randomUUID(),
  name = `rolecast-smoke-${suffix}`,
  volume = `rolecast-smoke-data-${suffix}`,
  restored = `rolecast-smoke-restored-${suffix}`;
function docker(args, { input, allowFailure = false } = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    input,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0)
    throw new Error(`Docker smoke operation failed: ${result.stderr}`);
  return result;
}
const env = Object.entries({
  LLM_API_KEY: "fixture",
  LLM_BASE_URL: "https://provider.invalid/v1",
  LLM_MODEL: "fixture",
  HOST: "0.0.0.0",
  PORT: "8080",
  DEPLOYMENT_MODE: "gcp",
  DATABASE_PATH: "/data/role-cast.sqlite",
}).flatMap(([k, v]) => ["--env", `${k}=${v}`]);
const stop = () => docker(["rm", "--force", name], { allowFailure: true });
function start(data, fixture = false) {
  const args = [
    "run",
    "--detach",
    "--name",
    name,
    "--network",
    "none",
    "--read-only",
    "--tmpfs",
    "/tmp",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    ...env,
    "--mount",
    `type=volume,src=${data},dst=/data`,
  ];
  if (fixture)
    args.push(
      "--mount",
      `type=bind,src=${resolve(root, "tests/support")},dst=/app/tests/support,readonly`,
    );
  args.push(image);
  if (fixture) args.push("node", "tests/support/container-server.js");
  docker(args);
}
function api(path, body) {
  const code = `import {readFileSync} from 'node:fs';const {path,body}=JSON.parse(readFileSync(0,'utf8'));const r=await fetch('http://127.0.0.1:8080'+path,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});console.log(JSON.stringify({status:r.status,text:await r.text()}));`;
  return JSON.parse(
    docker(["exec", "-i", name, "node", "--input-type=module", "-e", code], {
      input: JSON.stringify({ path, body }),
    }).stdout,
  );
}
async function until(fn) {
  let last;
  for (let n = 0; n < 50; n++) {
    try {
      const value = fn();
      if (value) return value;
    } catch (e) {
      last = e;
    }
    await delay(200);
  }
  throw last || new Error("Timed out waiting for container state");
}
const json = (path, body) => JSON.parse(api(path, body).text);
try {
  docker(["volume", "create", volume]);
  docker(["volume", "create", restored]);
  for (const v of [volume, restored])
    docker([
      "run",
      "--rm",
      "--network",
      "none",
      "--user",
      "0",
      "--mount",
      `type=volume,src=${v},dst=/data`,
      image,
      "node",
      "-e",
      "require('fs').chownSync('/data',1000,1000)",
    ]);
  const missing = docker(["run", "--rm", "--network", "none", ...env, image], {
    allowFailure: true,
  });
  assert.notEqual(
    missing.status,
    0,
    "cloud startup must reject a missing mount",
  );
  assert.match(missing.stderr, /persistent \/data mount required/);
  start(volume);
  await until(() => json("/api/health").status === "ok");
  assert.equal(api("/").status, 200);
  assert.match(api("/").text, /<html/i);
  assert.deepEqual(json("/api/runtime"), { deploymentMode: "gcp" });
  assert.equal(docker(["exec", name, "id", "-u"]).stdout.trim(), "1000");
  stop();
  // Host recovery helpers run as root; their read-only SQLite checks must not
  // leave sidecars that prevent the non-root application from starting again.
  docker([
    "run",
    "--rm",
    "--network",
    "none",
    "--user",
    "0",
    "--mount",
    `type=volume,src=${volume},dst=/data`,
    image,
    "node",
    "scripts/gcp/database.js",
    "compatible",
    "/data/role-cast.sqlite",
  ]);
  start(volume);
  await until(() => json("/api/health").status === "ok");
  stop();
  start(volume, true);
  await until(() => json("/api/health").status === "ok");
  const response = api("/api/sessions", { scenarioId: "anti-fraud" });
  assert.equal(response.status, 202);
  const { id } = JSON.parse(response.text);
  const session = await until(() => {
    const s = json(`/api/sessions/${id}`);
    return s.state === "awaiting_call" && s;
  });
  const { callId } = json(`/api/sessions/${id}/calls/accept`, {
    assignmentId: session.pendingCall.assignmentId,
  });
  await until(() => !json(`/api/sessions/${id}`).busy);
  const message = api(`/api/sessions/${id}/calls/${callId}/messages`, {
    clientMessageId: "smoke-message",
    text: "fixture accepted message",
  });
  assert.equal(message.status, 202);
  await until(() => !json(`/api/sessions/${id}`).busy);
  docker(["restart", "--time", "15", name]);
  await until(() => json("/api/health").status === "ok");
  const interrupted = json(`/api/sessions/${id}`);
  assert.equal(interrupted.state, "interrupted");
  assert.ok(
    interrupted.calls
      .flatMap((c) => c.messages)
      .some((m) => m.text === "fixture accepted message"),
  );
  docker([
    "exec",
    name,
    "node",
    "scripts/gcp/database.js",
    "backup",
    "/data/role-cast.sqlite",
    "/data/restore.sqlite",
    "fixture-commit",
    image,
  ]);
  docker([
    "exec",
    name,
    "node",
    "scripts/gcp/database.js",
    "verify",
    "/data/restore.sqlite",
  ]);
  stop();
  docker([
    "run",
    "--rm",
    "--network",
    "none",
    "--user",
    "0",
    "--mount",
    `type=volume,src=${volume},dst=/source,readonly`,
    "--mount",
    `type=volume,src=${restored},dst=/data`,
    image,
    "node",
    "--input-type=module",
    "-e",
    "import{copyFileSync,chownSync}from'node:fs';copyFileSync('/source/restore.sqlite','/data/role-cast.sqlite');chownSync('/data/role-cast.sqlite',1000,1000);",
  ]);
  start(restored);
  await until(() => json("/api/health").status === "ok");
  assert.equal(json(`/api/sessions/${id}`).state, "interrupted");
  console.log(
    "Container smoke passed: frontend/API, non-root user, required mount, async work, restart durability, backup and isolated restore; network disabled.",
  );
} finally {
  stop();
  docker(["volume", "rm", volume, restored], { allowFailure: true });
}

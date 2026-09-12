import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { root } from "../../apps/server/src/config.js";

const appImage = process.argv[2];
if (!appImage || appImage.startsWith("-"))
  throw new Error("Supply the tested app image");
const gatewayImage = readFileSync(
  resolve(root, "infra/gcp/gateway-image.txt"),
  "utf8",
).trim();
assert.match(gatewayImage, /@sha256:[a-f0-9]{64}$/);
const suffix = randomUUID(),
  network = `rolecast-gateway-${suffix}`,
  upstream = `rolecast-upstream-${suffix}`,
  gateway = `rolecast-proxy-${suffix}`,
  directory = mkdtempSync(join(tmpdir(), "rolecast-gateway-"));
function docker(args, allowFailure = false) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure)
    throw new Error(`Gateway smoke Docker operation failed: ${result.stderr}`);
  return (
    args[0] === "logs" ? result.stdout + result.stderr : result.stdout
  ).trim();
}

try {
  docker(["pull", gatewayImage]);
  docker(["network", "create", "--internal", network]);
  const config = readFileSync(
    resolve(root, "infra/gcp/gateway.conf.tftpl"),
    "utf8",
  ).replaceAll("${upstream}", `${upstream}:8080`);
  writeFileSync(join(directory, "nginx.conf"), config);
  docker([
    "run",
    "-d",
    "--name",
    upstream,
    "--network",
    network,
    "--read-only",
    "--tmpfs",
    "/tmp",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--mount",
    `type=bind,src=${resolve(root, "tests/support/gateway-server.js")},dst=/app/gateway-server.js,readonly`,
    "--entrypoint",
    "node",
    appImage,
    "/app/gateway-server.js",
  ]);
  docker([
    "run",
    "-d",
    "--name",
    gateway,
    "--network",
    network,
    "--read-only",
    "--tmpfs",
    "/tmp",
    "--security-opt",
    "no-new-privileges",
    "--mount",
    `type=bind,src=${join(directory, "nginx.conf")},dst=/tmp/rolecast-nginx.conf,readonly`,
    "--entrypoint",
    "nginx",
    gatewayImage,
    "-c",
    "/tmp/rolecast-nginx.conf",
    "-g",
    "daemon off;",
  ]);
  const client = (mode) =>
    docker([
      "run",
      "--rm",
      "--network",
      network,
      "--read-only",
      "--tmpfs",
      "/tmp",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--mount",
      `type=bind,src=${resolve(root, "tests/support/gateway-client.js")},dst=/app/gateway-client.js,readonly`,
      "--entrypoint",
      "node",
      appImage,
      "/app/gateway-client.js",
      `http://${gateway}:8080`,
      mode,
    ]);
  client("available");
  docker(["rm", "-f", upstream]);
  client("unavailable");
  console.log(
    "Gateway smoke passed: fixed private upstream, Host/Origin, secure cookies, incremental SSE, bidirectional WebSocket, disconnect cleanup and bounded upstream failure; isolated network, no model credentials.",
  );
} catch (error) {
  for (const name of [upstream, gateway]) {
    console.error(docker(["logs", name], true));
    console.error(
      docker(
        [
          "inspect",
          "--format",
          "{{json .State}} {{json .NetworkSettings.Ports}}",
          name,
        ],
        true,
      ),
    );
  }
  throw error;
} finally {
  docker(["rm", "-f", gateway, upstream], true);
  docker(["network", "rm", network], true);
  rmSync(directory, { recursive: true, force: true });
}

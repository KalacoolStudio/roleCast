// Executed only inside the internal Docker network by gateway-smoke.js.
import assert from "node:assert/strict";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import WebSocket from "ws";
const base = process.argv[2];
const address = new URL(base).host;
async function until(fn) {
  let error;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      if (await fn()) return;
    } catch (caught) {
      error = caught;
    }
    await delay(250);
  }
  throw error || new Error("Gateway smoke timed out");
}
if (process.argv[3] === "unavailable") {
  const response = await fetch(base + "/__gateway/ready", {
    signal: AbortSignal.timeout(8000),
  });
  assert.equal(response.status, 502);
} else {
  const request = (path, options = {}) =>
    fetch(base + path, { signal: AbortSignal.timeout(8000), ...options });
  await until(async () => (await request("/__gateway/ready")).ok);
  const response = await request("/headers?target=http://untrusted.invalid", {
    method: "POST",
    headers: {
      Host: address,
      Origin: `https://${address}`,
      Cookie: "workspace=fixture",
      "X-Forwarded-Proto": "http",
      "X-Forwarded-Host": "untrusted.invalid",
      Forwarded: "host=untrusted.invalid",
      Authorization: "fixture-not-forwarded",
    },
    body: "fixture-body",
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(
    response.headers.get("set-cookie"),
    /HttpOnly; Secure; SameSite=Strict/,
  );
  const echoed = await response.json();
  assert.equal(echoed.body, "fixture-body");
  assert.equal(echoed.headers.host, address);
  assert.equal(echoed.headers.origin, `https://${address}`);
  assert.equal(echoed.headers.cookie, "workspace=fixture");
  assert.equal(echoed.headers["x-forwarded-proto"], "https");
  for (const name of ["x-forwarded-host", "forwarded", "authorization"])
    assert.equal(echoed.headers[name], undefined);
  assert.equal(
    (
      await request("/headers", {
        headers: {
          Host: address,
          Origin: "https://untrusted.invalid",
          "X-Forwarded-Host": "untrusted.invalid",
        },
      })
    ).status,
    403,
  );
  const controller = new AbortController();
  const stream = await request("/events", {
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
  });
  const reader = stream.body.getReader();
  const first = await reader.read();
  assert.match(Buffer.from(first.value).toString(), /"first":true/);
  // The backend cannot finish until this request: buffering would deadlock above.
  assert.equal((await request("/finish-events")).status, 200);
  assert.match(
    Buffer.from((await reader.read()).value).toString(),
    /"last":true/,
  );
  assert.equal((await reader.read()).done, true);
  const abandoned = await request("/events", { signal: controller.signal });
  await abandoned.body.getReader().read();
  controller.abort();
  const socket = new WebSocket(`ws://${address}/voice`, {
    headers: {
      Host: address,
      Origin: `https://${address}`,
      Cookie: "workspace=fixture",
    },
    handshakeTimeout: 5000,
  });
  await once(socket, "open");
  const received = once(socket, "message");
  const frame = Buffer.from([0, 1, 2, 3, 255]);
  socket.send(frame);
  const [echo, binary] = await received;
  assert.equal(binary, true);
  assert.deepEqual(echo, frame);
  const closed = once(socket, "close");
  socket.close();
  await closed;
  await until(async () => {
    const state = await (await request("/status")).json();
    return state.closedStreams >= 2 && state.closedSockets === 1;
  });
}

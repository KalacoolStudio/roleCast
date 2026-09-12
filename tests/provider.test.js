import { afterEach, expect, it } from "vitest";
import { createServer } from "node:http";
import { Agents } from "../packages/core/src/agents.js";
const servers = [];
afterEach(async () => {
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    await new Promise((resolve) => s.close(resolve));
  }
});
async function provider(handler) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({
      url: req.url,
      headers: req.headers,
      body: JSON.parse(body),
    });
    handler(req, res, requests.length);
  });
  servers.push(server);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const config = {
    baseURL: `http://127.0.0.1:${server.address().port}/v1`,
    apiKey: "SENTINEL_SECRET",
    model: "test-model",
  };
  return { config, requests };
}
function completion(res, text) {
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      id: "test",
      object: "chat.completion",
      created: 1,
      model: "test-model",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: text },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
  );
}
const reply = { text: "測試回覆", requestHangup: false };
it("uses configured Chat API, key and model with JSON validation", async () => {
  const { config, requests } = await provider((_req, res) =>
    completion(res, JSON.stringify(reply)),
  );
  expect(await new Agents(config).run("reply", { messages: [] })).toEqual(
    reply,
  );
  expect(requests[0].url).toBe("/v1/chat/completions");
  expect(requests[0].headers.authorization).toBe("Bearer SENTINEL_SECRET");
  expect(requests[0].body.model).toBe("test-model");
  expect(requests[0].body.messages[0].content).toContain("JSON Schema");
});
it("repairs malformed output once then succeeds", async () => {
  const { config, requests } = await provider((_req, res, n) =>
    completion(res, n === 1 ? "invalid" : JSON.stringify(reply)),
  );
  expect(await new Agents(config).run("reply", { messages: [] })).toEqual(
    reply,
  );
  expect(requests).toHaveLength(2);
});
it("rejects invalid references before returning a structured result", async () => {
  const { config, requests } = await provider((_req, res) =>
    completion(
      res,
      JSON.stringify({
        stop: true,
        reason: "stop",
        criterionIds: ["x"],
        evidenceIds: ["fake"],
      }),
    ),
  );
  await expect(
    new Agents(config).run("watch", { criteria: [{ id: "x" }], messages: [] }),
  ).rejects.toMatchObject({ code: "MODEL_INVALID" });
  expect(requests).toHaveLength(2);
});
it.each([401, 403, 429, 500])(
  "handles HTTP %i without leaking secrets or nested retries",
  async (status) => {
    const { config, requests } = await provider((_req, res) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: { message: "SENTINEL_SECRET" } }));
    });
    let error;
    try {
      await new Agents(config).run("reply", { messages: [] });
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(String(error)).not.toContain("SENTINEL_SECRET");
    expect(requests).toHaveLength(status === 401 || status === 403 ? 1 : 2);
  },
);
it("times out with a bounded total number of requests", async () => {
  const { config, requests } = await provider(() => {});
  await expect(
    new Agents(config, { timeoutMs: 25 }).run("reply", { messages: [] }),
  ).rejects.toMatchObject({ code: "MODEL_TIMEOUT" });
  expect(requests.length).toBeLessThanOrEqual(2);
  expect(requests.length).toBeGreaterThan(0);
});
it("aborts without retrying", async () => {
  const { config, requests } = await provider(() => {});
  const controller = new AbortController();
  const result = new Agents(config).run(
    "reply",
    { messages: [] },
    controller.signal,
  );
  setTimeout(() => controller.abort(), 30);
  await expect(result).rejects.toMatchObject({ code: "CANCELLED" });
  expect(requests).toHaveLength(1);
});

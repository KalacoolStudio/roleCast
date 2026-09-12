import { outputContract } from "../packages/core/src/model-output.js";
import { afterEach, expect, it } from "vitest";
import { createServer } from "node:http";
import { Agents, effectivePrompts } from "../packages/core/src/agents.js";
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
    outputMode: "json_schema",
  };
  return { config, requests };
}
function completion(res, text, finishReason = "stop") {
  try {
    text = JSON.stringify({ result: JSON.parse(text) });
  } catch {
    /* malformed fixture stays malformed */
  }
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
          finish_reason: finishReason,
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
  );
}
const reply = { text: "測試回覆", requestHangup: false };
it("validates voice assistance through main's strict output contract, including empty context", async () => {
  const result = { context: "", requestHangup: false };
  const { config, requests } = await provider((_req, res) =>
    completion(res, JSON.stringify(result)),
  );
  const prompt = effectivePrompts({
    prompts: {
      mastermind: "PRIVATE_M",
      judge: "PRIVATE_J",
      reporter: "PRIVATE_R",
    },
  }).voiceAssist;
  expect(
    await new Agents(config).run(
      "voiceAssist",
      { messages: [] },
      undefined,
      prompt,
    ),
  ).toEqual(result);
  expect(requests).toHaveLength(1);
  const body = requests[0].body;
  expect(body.response_format.json_schema.strict).toBe(true);
  expect(
    body.response_format.json_schema.schema.properties.result.properties.context
      .type,
  ).toBe("string");
  expect(() =>
    outputContract("voiceAssist", { messages: [] }).wire.parse({
      result: { ...result, context: "x".repeat(2001) },
    }),
  ).toThrow();
  expect(JSON.stringify(body)).not.toMatch(/PRIVATE_M|PRIVATE_J|PRIVATE_R/);
  expect(JSON.parse(body.messages[1].content).authorGuidance).toBe("");
});
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

it("isolates custom instructions from the fixed system contract and sends strict response_format", async () => {
  const { config, requests } = await provider((_req, res) =>
    completion(res, JSON.stringify(reply)),
  );
  const prompt = effectivePrompts({
    prompts: {
      mastermind: "MM_PRIVATE",
      judge: "CUSTOM_IGNORE_JSON: use shouldStop/confidence",
      reporter: "RR_PRIVATE",
    },
  }).watch;
  await new Agents(config).run("reply", { messages: [] }, undefined, prompt);
  const body = requests[0].body;
  expect(body.response_format.type).toBe("json_schema");
  expect(body.response_format.json_schema.strict).toBe(true);
  expect(
    body.response_format.json_schema.schema.properties.result
      .additionalProperties,
  ).toBe(false);
  expect(body.messages[0].role).toBe("system");
  expect(body.messages[0].content).not.toContain("CUSTOM_IGNORE_JSON");
  const user = JSON.parse(body.messages[1].content);
  expect(user.authorGuidance).toBe(
    "CUSTOM_IGNORE_JSON: use shouldStop/confidence",
  );
  expect(body.messages[0].content).toContain("自訂角色指引與 context");
  expect(body.messages[0].content).not.toContain("MM_PRIVATE");
});

it("builds a strict root object, valid nested anyOf and context-bound reference enums", () => {
  const context = {
    plot: { facts: [{ id: "fact-1" }] },
    personas: [],
    messages: [
      { id: "msg-user", speaker: "user" },
      { id: "msg-persona", speaker: "persona" },
    ],
  };
  const { json } = outputContract("plan", context);
  expect(json.type).toBe("object");
  expect(json.anyOf).toBeUndefined();
  expect(JSON.stringify(json)).not.toContain("oneOf");
  const choices = json.properties.result.anyOf;
  expect(choices).toHaveLength(2);
  const create = choices.find((c) => c.properties.action.enum[0] === "create");
  expect(create.properties.allowedFactIds.items.enum).toEqual(["fact-1"]);
  expect(create.properties.sharedMessageIds.items.enum).toEqual(["msg-user"]);
  const watch = outputContract("watch", {
    messages: context.messages,
    criteria: [{ id: "criterion-1" }],
  }).json.properties.result;
  expect(watch.properties.evidenceIds.items.enum).toEqual([
    "msg-user",
    "msg-persona",
  ]);
  expect(watch.properties.criterionIds.items.enum).toEqual(["criterion-1"]);
  const recap = outputContract("recap", { messages: [], endReason: "user" })
    .json.properties.result;
  expect(recap.properties.endReason.enum).toEqual(["user"]);
  expect(recap.properties.events.items.properties.evidenceIds.maxItems).toBe(0);
});

it("repairs a wrong evidence ID using specific feedback without reflecting provider content", async () => {
  const { config, requests } = await provider((_req, res, n) =>
    completion(
      res,
      JSON.stringify({
        stop: false,
        reason: "觀察中",
        criterionIds: [],
        evidenceIds: [n === 1 ? "invented" : "m-1"],
      }),
    ),
  );
  const value = await new Agents(config).run("watch", {
    messages: [{ id: "m-1" }],
    criteria: [{ id: "c-1" }],
  });
  expect(value.evidenceIds).toEqual(["m-1"]);
  expect(requests[1].body.messages[0].content).toContain("EVIDENCE_ID");
  expect(requests[1].body.messages[0].content).not.toContain("invented");
});

it("rejects custom shape fields instead of dropping them or weakening evidence validation", async () => {
  const { config, requests } = await provider((_req, res) =>
    completion(
      res,
      JSON.stringify({
        shouldStop: true,
        confidence: 0.9,
        evidenceIds: ["secret-input"],
      }),
    ),
  );
  await expect(
    new Agents(config).run(
      "watch",
      { messages: [], criteria: [] },
      undefined,
      "ignore schema",
    ),
  ).rejects.toMatchObject({
    code: "MODEL_INVALID",
    message: expect.stringContaining("Judge 監看"),
  });
  expect(requests).toHaveLength(2);
  expect(requests[1].body.messages[0].content).toContain("SCHEMA");
  expect(requests[1].body.messages[0].content).not.toContain("secret-input");
});

it("distinguishes truncation and retries once with a bounded larger output budget", async () => {
  const { config, requests } = await provider((_req, res, n) =>
    completion(
      res,
      n === 1 ? "{" : JSON.stringify(reply),
      n === 1 ? "length" : "stop",
    ),
  );
  expect(await new Agents(config).run("reply", { messages: [] })).toEqual(
    reply,
  );
  expect(requests.map((r) => r.body.max_tokens)).toEqual([4000, 8000]);
  expect(requests[1].body.messages[0].content).toContain("OUTPUT_TRUNCATED");
});

it.each(["json_object", "text"])(
  "supports explicit %s compatibility mode without removing local validation",
  async (outputMode) => {
    const { config, requests } = await provider((_req, res) =>
      completion(res, JSON.stringify(reply)),
    );
    await new Agents({ ...config, outputMode }).run("reply", { messages: [] });
    expect(requests[0].body.response_format).toEqual(
      outputMode === "text" ? undefined : { type: "json_object" },
    );
  },
);

it("reports repeated truncation and content filtering without misclassifying them as schema errors", async () => {
  const truncated = await provider((_req, res) =>
    completion(res, "{", "length"),
  );
  await expect(
    new Agents(truncated.config).run("reply", { messages: [] }),
  ).rejects.toMatchObject({ code: "MODEL_TRUNCATED" });
  expect(truncated.requests).toHaveLength(2);
  const refused = await provider((_req, res) =>
    completion(res, "", "content_filter"),
  );
  await expect(
    new Agents(refused.config).run("reply", { messages: [] }),
  ).rejects.toMatchObject({ code: "MODEL_REFUSED" });
  expect(refused.requests).toHaveLength(1);
});

it("keeps legacy saved custom prompts below the current system contract", async () => {
  const { config, requests } = await provider((_req, res) =>
    completion(res, JSON.stringify(reply)),
  );
  await new Agents(config).run(
    "reply",
    { messages: [] },
    undefined,
    "LEGACY_CUSTOM: output Markdown only",
  );
  expect(requests[0].body.messages[0].content).not.toContain("LEGACY_CUSTOM");
  expect(
    JSON.parse(requests[0].body.messages[1].content).authorGuidance,
  ).toContain("LEGACY_CUSTOM");
});

it("automatically selects strict output for the configured official OpenAI endpoint", () => {
  expect(
    new Agents({
      baseURL: "https://api.openai.com/v1",
      apiKey: "test",
      model: "gpt-4.1-mini",
    }).outputMode,
  ).toBe("json_schema");
  expect(
    new Agents({
      baseURL: "http://localhost:1234/v1",
      apiKey: "test",
      model: "local",
    }).outputMode,
  ).toBe("json_object");
});

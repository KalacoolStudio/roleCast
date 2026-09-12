import Fastify from "fastify";
import staticPlugin from "@fastify/static";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { AppError } from "../../../packages/core/src/contracts.js";
import { publicScenario } from "../../../packages/core/src/scenarios.js";

export async function createApp(
  engine,
  { webRoot = fileURLToPath(new URL("../../web/dist/", import.meta.url)) } = {},
) {
  const app = Fastify({
    logger: false,
    bodyLimit: 32768,
    forceCloseConnections: true,
  });
  const body = (properties, required) => ({
    schema: {
      body: {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      },
    },
  });
  const identifier = { type: "string", minLength: 1, maxLength: 100 };
  app.setErrorHandler((error, _request, reply) => {
    const known = error instanceof AppError;
    const status = known
      ? error.status
      : error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 500;
    reply.code(status).send({
      code: known
        ? error.code
        : status < 500
          ? "INVALID_INPUT"
          : "INTERNAL_ERROR",
      message: known
        ? error.message
        : status < 500
          ? "請求格式不正確。"
          : "服務處理失敗。",
      ...(error.activeId ? { activeId: error.activeId } : {}),
    });
  });
  // Loopback deployment: reject browser requests from other origins without enabling CORS.
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin) {
      let allowed = false;
      try {
        const u = new URL(origin);
        allowed =
          ["http:", "https:"].includes(u.protocol) &&
          ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
      } catch {
        /* malformed origin */
      }
      if (!allowed)
        return reply
          .code(403)
          .send({ code: "FORBIDDEN", message: "僅限本機操作。" });
    }
  });
  app.get("/api/health", async () => {
    engine.store.db.prepare("SELECT 1").get();
    return { status: "ok" };
  });
  app.get("/api/scenarios", async () => engine.scenarios.map(publicScenario));
  app.get("/api/sessions", async () => ({
    sessions: engine.list(),
    activeId: engine.store.active() || null,
  }));
  app.post(
    "/api/sessions",
    body(
      {
        scenarioId: identifier,
        background: { type: "string", maxLength: 2000 },
      },
      ["scenarioId"],
    ),
    async (req, reply) => {
      const id = engine.start(req.body?.scenarioId, req.body?.background ?? "");
      return reply.code(202).send({ id });
    },
  );
  app.get("/api/sessions/:id", async (req) => engine.view(req.params.id));
  app.post(
    "/api/sessions/:id/calls/accept",
    body({ assignmentId: identifier }, ["assignmentId"]),
    async (req, reply) =>
      reply
        .code(202)
        .send({ callId: engine.accept(req.params.id, req.body?.assignmentId) }),
  );
  app.post(
    "/api/sessions/:id/calls/:callId/messages",
    body(
      {
        clientMessageId: identifier,
        text: { type: "string", minLength: 1, maxLength: 4000 },
      },
      ["clientMessageId", "text"],
    ),
    async (req, reply) =>
      reply.code(202).send({
        messageId: engine.send(
          req.params.id,
          req.params.callId,
          req.body?.clientMessageId,
          req.body?.text,
        ),
      }),
  );
  app.post("/api/sessions/:id/calls/:callId/hangup", async (req) => {
    engine.closeCall(req.params.id, req.params.callId);
    return { ok: true };
  });
  app.post("/api/sessions/:id/finish", async (req) => {
    engine.finish(req.params.id);
    return { ok: true };
  });
  app.get("/api/sessions/:id/report", async (req, reply) => {
    const s = engine.view(req.params.id);
    return reply
      .code(s.report ? 200 : 202)
      .send({ state: s.state, report: s.report });
  });
  if (existsSync(webRoot)) {
    await app.register(staticPlugin, { root: webRoot });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({ message: "找不到 API。" })
        : reply.sendFile("index.html"),
    );
  }
  app.addHook("onClose", async () => {
    engine.dispose();
    engine.store.close();
  });
  return app;
}

import { registerStageRoutes } from "./stage-stream.js";
import Fastify from "fastify";
import staticPlugin from "@fastify/static";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { AppError } from "../../../packages/core/src/contracts.js";
import { publicPlot } from "../../../packages/core/src/plot-contracts.js";

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
  // Allow local development and same-host HTTPS tunnels without enabling CORS.
  // ngrok preserves Host; do not use client-supplied X-Forwarded-Host here.
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin) {
      let allowed = false;
      try {
        const u = new URL(origin);
        allowed =
          ["http:", "https:"].includes(u.protocol) &&
          (["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) ||
            (u.protocol === "https:" && u.host === request.headers.host));
      } catch {
        /* malformed origin */
      }
      if (!allowed)
        return reply
          .code(403)
          .send({ code: "FORBIDDEN", message: "不允許此請求來源。" });
    }
  });
  app.get("/api/health", async () => {
    engine.store.db.prepare("SELECT 1").get();
    return { status: "ok" };
  });
  app.get("/api/plots", async () => engine.store.listPlots().map(publicPlot));
  app.get("/api/plots/:id", async (req) => engine.store.getPlot(req.params.id));
  app.post("/api/plots", { bodyLimit: 262144 }, async (req, reply) =>
    reply.code(201).send(engine.store.createPlot(req.body)),
  );
  app.put("/api/plots/:id", { bodyLimit: 262144 }, async (req) =>
    engine.store.updatePlot(req.params.id, req.body),
  );
  app.get("/api/scenarios", async () =>
    engine.store.listPlots().map(publicPlot),
  );
  for (const resource of ["drills", "sessions"]) {
    const legacy = resource === "sessions";
    const plotKey = legacy ? "scenarioId" : "plotId";
    const project = (drill) => {
      if (!legacy) return drill;
      const { plot, ...rest } = drill;
      return { ...rest, scenario: plot };
    };
    app.get(`/api/${resource}`, async () => ({
      [resource]: engine.list().map(project),
      activeId: engine.store.active() || null,
    }));
    app.post(
      `/api/${resource}`,
      body(
        {
          [plotKey]: identifier,
          background: { type: "string", maxLength: 2000 },
        },
        [plotKey],
      ),
      async (req, reply) => {
        const id = engine.start(
          req.body?.[plotKey],
          req.body?.background ?? "",
        );
        return reply.code(202).send({ id });
      },
    );
    app.get(`/api/${resource}/:id`, async (req) =>
      project(engine.view(req.params.id)),
    );
    app.post(
      `/api/${resource}/:id/calls/accept`,
      body({ assignmentId: identifier }, ["assignmentId"]),
      async (req, reply) =>
        reply.code(202).send({
          callId: engine.accept(req.params.id, req.body?.assignmentId),
        }),
    );
    app.post(
      `/api/${resource}/:id/calls/:callId/messages`,
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
    app.post(`/api/${resource}/:id/calls/:callId/hangup`, async (req) => {
      engine.closeCall(req.params.id, req.params.callId);
      return { ok: true };
    });
    app.post(`/api/${resource}/:id/finish`, async (req) => {
      engine.finish(req.params.id);
      return { ok: true };
    });
    app.get(`/api/${resource}/:id/report`, async (req, reply) => {
      const s = engine.view(req.params.id);
      return reply
        .code(s.report ? 200 : 202)
        .send({ state: s.state, report: s.report });
    });
  }
  registerStageRoutes(app, engine);
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

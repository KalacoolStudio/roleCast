import { registerStageRoutes } from "./stage-stream.js";
import Fastify from "fastify";
import staticPlugin from "@fastify/static";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { AppError } from "../../../packages/core/src/contracts.js";
import { publicPlot } from "../../../packages/core/src/plot-contracts.js";
import { VoiceCoordinator, voiceError } from "./voice.js";
import { createVoiceRelay } from "./voice-relay.js";

export async function createApp(
  engine,
  {
    webRoot = fileURLToPath(new URL("../../web/dist/", import.meta.url)),
    deploymentMode = "local",
    voice,
    liveClient,
    voiceOptions,
    frontendOrigins,
    testWorkspaceToken,
  } = {},
) {
  if (!["local", "gcp"].includes(deploymentMode))
    throw new Error("Invalid deployment mode");
  const app = Fastify({
    logger: false,
    bodyLimit: 32768,
    forceCloseConnections: true,
  });
  const media = new VoiceCoordinator(engine, {
    ...voiceOptions,
    settings: voice,
    client: liveClient,
  });
  const cookieName = "role_cast_workspace";
  const tokenHash = (token) => createHash("sha256").update(token).digest("hex");
  const cookieToken = (header = "") => {
    for (const part of header.split(";")) {
      const [name, ...value] = part.trim().split("=");
      if (name === cookieName) {
        const token = value.join("=");
        if (/^[a-zA-Z0-9_-]{43}$/.test(token)) return token;
      }
    }
    return null;
  };
  const testWorkspaceId = testWorkspaceToken
    ? engine.store.claimWorkspace(tokenHash(testWorkspaceToken))
    : null;
  if (testWorkspaceId) engine.ensureWorkspace(testWorkspaceId);
  const workspaceFor = (headers) => {
    if (testWorkspaceId) return testWorkspaceId;
    const token = cookieToken(headers.cookie);
    return token ? engine.store.workspace(tokenHash(token)) : null;
  };
  const relay = createVoiceRelay(
    app.server,
    media,
    frontendOrigins,
    (request) => workspaceFor(request.headers),
  );
  app.decorate("voice", media);
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
    if (
      request.url.startsWith("/api/") &&
      ![
        "/api/health",
        "/api/runtime",
        "/api/capabilities",
        "/api/workspace",
      ].includes(request.url.split("?")[0])
    ) {
      request.workspaceId = workspaceFor(request.headers);
      if (!request.workspaceId)
        return reply.code(401).send({
          code: "WORKSPACE_REQUIRED",
          message: "請重新整理頁面以建立私人工作區。",
        });
      reply.header("Cache-Control", "private, no-store");
    }
  });
  app.get("/api/health", async () => {
    engine.store.db.prepare("SELECT 1").get();
    return { status: "ok" };
  });
  app.get("/api/runtime", async () => ({ deploymentMode }));
  app.get("/api/capabilities", async () => ({ voice: media.capabilities() }));
  app.get("/api/workspace", async (req, reply) => {
    let workspaceId = workspaceFor(req.headers);
    if (!workspaceId) {
      const token = randomBytes(32).toString("base64url");
      workspaceId = engine.store.claimWorkspace(tokenHash(token));
      const loopbackHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(
        req.headers.host || "",
      );
      const secure =
        req.protocol === "https" ||
        (!loopbackHost && req.headers["x-forwarded-proto"] === "https");
      reply.header(
        "Set-Cookie",
        `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${secure ? "; Secure" : ""}`,
      );
    }
    engine.ensureWorkspace(workspaceId);
    reply.header("Cache-Control", "private, no-store");
    return { ready: true };
  });
  app.get("/api/plots", async (req) =>
    engine.store.listPlots(req.workspaceId).map(publicPlot),
  );
  app.get("/api/plots/:id", async (req) =>
    engine.store.getPlot(req.params.id, req.workspaceId),
  );
  app.post("/api/plots", { bodyLimit: 262144 }, async (req, reply) =>
    reply.code(201).send(engine.store.createPlot(req.body, req.workspaceId)),
  );
  app.put("/api/plots/:id", { bodyLimit: 262144 }, async (req) =>
    engine.store.updatePlot(req.params.id, req.body, req.workspaceId),
  );
  app.get("/api/scenarios", async (req) =>
    engine.store.listPlots(req.workspaceId).map(publicPlot),
  );
  for (const resource of ["drills", "sessions"]) {
    const legacy = resource === "sessions";
    const plotKey = legacy ? "scenarioId" : "plotId";
    const project = (drill) => {
      if (!legacy) return drill;
      const { plot, ...rest } = drill;
      return { ...rest, scenario: plot };
    };
    app.get(`/api/${resource}`, async (req) => ({
      [resource]: engine.list(req.workspaceId).map(project),
      activeId: engine.store.active(req.workspaceId) || null,
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
          req.workspaceId,
        );
        return reply.code(202).send({ id });
      },
    );
    app.get(`/api/${resource}/:id`, async (req) =>
      project(engine.view(req.params.id, req.workspaceId)),
    );
    app.post(
      `/api/${resource}/:id/calls/accept`,
      body(
        {
          assignmentId: identifier,
          mode: { type: "string", enum: ["text", "voice"] },
        },
        ["assignmentId"],
      ),
      async (req, reply) => {
        if (req.body.mode === "voice") {
          relay.requireOrigin(req.headers.origin, req.headers.host);
          if (!media.capabilities().available) throw voiceError();
        }
        return reply.code(202).send({
          callId: engine.accept(
            req.params.id,
            req.body.assignmentId,
            req.body.mode,
            req.workspaceId,
          ),
        });
      },
    );
    app.post(
      `/api/${resource}/:id/calls/:callId/voice`,
      body({ requestId: identifier }, ["requestId"]),
      async (req, reply) => {
        relay.requireOrigin(req.headers.origin, req.headers.host);
        return reply
          .code(201)
          .send(
            media.reserve(
              req.params.id,
              req.params.callId,
              req.body.requestId,
              req.workspaceId,
            ),
          );
      },
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
            req.workspaceId,
          ),
        }),
    );
    app.post(`/api/${resource}/:id/calls/:callId/hangup`, async (req) => {
      engine.closeCall(
        req.params.id,
        req.params.callId,
        "user",
        req.workspaceId,
      );
      return { ok: true };
    });
    app.post(`/api/${resource}/:id/finish`, async (req) => {
      engine.finish(req.params.id, req.workspaceId);
      return { ok: true };
    });
    app.get(`/api/${resource}/:id/report`, async (req, reply) => {
      const s = engine.view(req.params.id, req.workspaceId);
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
  app.addHook("preClose", async () => {
    engine.dispose();
    await media.dispose();
    await relay.dispose();
  });
  app.addHook("onClose", async () => {
    engine.store.close();
  });
  return app;
}

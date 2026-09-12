import { AppError, terminal } from "../../../packages/core/src/contracts.js";

export function cursor(value, fallback = 0) {
  if (value === undefined) return fallback;
  if (
    typeof value !== "string" ||
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  )
    throw new AppError("INVALID_CURSOR", "事件游標或筆數不正確。", 400);
  return Number(value);
}

// A slow socket gets no application-level backlog: resume reading SQLite on drain.
export function streamStage(engine, id, after, response, onClose = () => {}) {
  let sequence = after,
    revision = -1,
    closed = false,
    blocked = false,
    scheduled;
  const write = (value) => {
    if (closed) return false;
    blocked = !response.write(value);
    if (response.writableLength > 512 * 1024) close(true);
    return !blocked && !closed;
  };
  const close = (destroy = false) => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(stall);
    clearImmediate(scheduled);
    unsubscribe();
    response.off("drain", drain);
    response.off("close", close);
    response.off("error", close);
    onClose();
    if (destroy) response.destroy();
    else response.end();
  };
  const pump = () => {
    scheduled = undefined;
    if (closed || blocked) return;
    try {
      const page = engine.store.events(id, sequence, 100);
      for (const event of page.events) {
        sequence = event.sequence;
        if (
          !write(
            `id: ${sequence}\nevent: stage\ndata: ${JSON.stringify(event)}\n\n`,
          )
        )
          return armStall();
      }
      if (page.hasMore) return schedule();
      const snapshot = engine.view(id);
      if (snapshot.stage.revision > revision) {
        revision = snapshot.stage.revision;
        if (!write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`))
          return armStall();
      }
      if (terminal(snapshot.state)) close();
    } catch {
      close(true);
    }
  };
  const schedule = () => {
    if (!closed && !scheduled && !blocked) scheduled = setImmediate(pump);
  };
  let stall;
  const armStall = () => {
    if (!closed && !stall) stall = setTimeout(() => close(true), 15000);
  };
  const drain = () => {
    blocked = false;
    clearTimeout(stall);
    stall = undefined;
    schedule();
  };
  const unsubscribe = engine.store.subscribe((changedId) => {
    if (changedId === id) schedule();
  });
  const heartbeat = setInterval(() => {
    if (!blocked && !write(": heartbeat\n\n")) armStall();
  }, 15000);
  response.on("drain", drain);
  response.on("close", close);
  response.on("error", close);
  schedule();
  return close;
}

export function registerStageRoutes(app, engine) {
  const streams = new Set();
  app.get("/api/drills/:id/events", async (req) =>
    engine.store.events(
      req.params.id,
      cursor(req.query.after),
      cursor(req.query.limit, 100),
    ),
  );
  app.get("/api/drills/:id/events/stream", async (req, reply) => {
    const after = cursor(req.headers["last-event-id"] ?? req.query.after);
    engine.store.events(req.params.id, after, 1);
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    });
    reply.raw.flushHeaders();
    const stop = streamStage(engine, req.params.id, after, reply.raw, () =>
      streams.delete(stop),
    );
    streams.add(stop);
  });
  app.addHook("preClose", async () => {
    for (const stop of streams) stop();
  });
}

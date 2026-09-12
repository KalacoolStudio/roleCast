import { WebSocketServer } from "ws";
import { AppError } from "../../../packages/core/src/contracts.js";
import { voiceError } from "./voice.js";

export function createVoiceRelay(
  server,
  coordinator,
  frontendOrigins = ["http://127.0.0.1:5173", "http://localhost:5173"],
  workspaceFor = () => "default",
) {
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 8192,
    perMessageDeflate: false,
  });
  const allowed = (origin, host) => {
    const port = server.address()?.port;
    let loopbackTunnel = false;
    try {
      const url = new URL(origin);
      loopbackTunnel =
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
        origin === `http://${host}`;
    } catch {
      // A malformed Origin must not authorize a voice connection.
    }
    return (
      typeof origin === "string" &&
      (loopbackTunnel ||
        origin === `https://${host}` ||
        [
          ...frontendOrigins,
          `http://127.0.0.1:${port}`,
          `http://localhost:${port}`,
        ].includes(origin))
    );
  };
  const requireOrigin = (origin, host) => {
    if (!allowed(origin, host))
      throw new AppError("FORBIDDEN", "語音連線僅限目前的應用程式來源。", 403);
  };
  const upgrade = (request, socket, head) => {
    const match =
      /^\/api\/(?:drills|sessions)\/([a-zA-Z0-9_-]+)\/calls\/([a-zA-Z0-9_-]+)\/voice\/([a-zA-Z0-9_-]+)$/.exec(
        request.url,
      );
    const workspaceId = workspaceFor(request);
    if (
      !match ||
      !allowed(request.headers.origin, request.headers.host) ||
      !workspaceId ||
      coordinator.disposed
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    sockets.handleUpgrade(request, socket, head, (ws) => {
      let item;
      const timer = setTimeout(() => ws.terminate(), 5000);
      const fail = (error) => {
        if (item)
          coordinator.stop(
            item,
            error?.code === "VOICE_BACKPRESSURE"
              ? error.code
              : "VOICE_PROTOCOL",
          );
        else ws.close(1008, "Invalid attachment");
      };
      ws.on("message", (data, binary) => {
        try {
          if (!item) {
            if (binary) throw voiceError("VOICE_PROTOCOL");
            const event = JSON.parse(data.toString());
            if (
              event?.type !== "attach" ||
              Object.keys(event).some((k) => !["type", "token"].includes(k))
            )
              throw voiceError("VOICE_PROTOCOL");
            item = coordinator.attach(
              match[1],
              match[2],
              match[3],
              event.token,
              ws,
              workspaceId,
            );
            clearTimeout(timer);
          } else if (binary) coordinator.audio(item, data);
          else coordinator.control(item, JSON.parse(data.toString()));
        } catch (error) {
          fail(error);
        }
      });
      ws.on("error", () => {
        if (item) coordinator.stop(item, "VOICE_UNAVAILABLE");
      });
      ws.on("close", () => {
        clearTimeout(timer);
        if (item && !item.frozen) coordinator.stop(item, "VOICE_UNAVAILABLE");
      });
    });
  };
  server.on("upgrade", upgrade);
  return {
    requireOrigin,
    dispose: async () => {
      server.removeListener("upgrade", upgrade);
      for (const ws of sockets.clients) ws.terminate();
      await new Promise((resolve) => sockets.close(resolve));
    },
  };
}

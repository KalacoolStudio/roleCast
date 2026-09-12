// Mounted only into the offline gateway smoke fixture, never a production entrypoint.
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const streams = new Set();
let closedStreams = 0,
  closedSockets = 0;
const server = createServer((req, res) => {
  if (
    req.headers.origin &&
    req.headers.origin !== `https://${req.headers.host}`
  ) {
    res.writeHead(403).end();
    return;
  }
  if (req.url === "/api/health") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: "ok" }));
  } else if (req.url === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "private, no-store",
      Connection: "keep-alive",
    });
    res.write('data: {"first":true}\n\n');
    streams.add(res);
    res.on("close", () => {
      streams.delete(res);
      closedStreams++;
    });
  } else if (req.url === "/finish-events") {
    for (const stream of streams) stream.end('data: {"last":true}\n\n');
    res.end("ok");
  } else if (req.url === "/status") {
    res.end(JSON.stringify({ closedStreams, closedSockets }));
  } else {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
        "Set-Cookie":
          "workspace=fixture; Path=/; HttpOnly; Secure; SameSite=Strict",
      });
      res.end(JSON.stringify({ url: req.url, headers: req.headers, body }));
    });
  }
});
const sockets = new WebSocketServer({ server });
sockets.on("connection", (socket) => {
  socket.on("message", (data, binary) => socket.send(data, { binary }));
  socket.on("close", () => closedSockets++);
});
server.listen(8080, "0.0.0.0");

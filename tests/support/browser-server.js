import { createApp } from "../../apps/server/src/app.js";
import { Store } from "../../packages/storage/src/store.js";
import { Engine } from "../../packages/core/src/engine.js";
import { fixtureAgents } from "./fixtures.js";
import { fakeLive, transcript } from "./voice.js";
const store = new Store();
const engine = new Engine(
  store,
  fixtureAgents(
    {
      voiceAssist: (context) => ({
        context: "",
        requestHangup: context.messages.some((m) =>
          m.text.includes("稍後聯繫"),
        ),
      }),
    },
    150,
  ),
);
// Persist terminal examples for history UI tests; this setup is never imported by production.
const failedId = engine.start("interview");
const failed = store.get(failedId);
failed.state = "failed";
failed.error = {
  code: "MODEL_AUTH",
  message: "模型 API 驗證失敗，請檢查後端設定。",
};
store.save(failed);
engine.start("anti-fraud");
store.recover();
let transcriptSequence = 0;
const say = (connection, text, speaker = "user") =>
  connection.emit(
    transcript(
      text,
      speaker,
      ++transcriptSequence * 80,
      `fixture-${transcriptSequence}`,
    ),
  );
const play = (connection) => {
  clearInterval(connection.outputTimer);
  let frames = 0;
  connection.outputTimer = setInterval(() => {
    if (connection.disconnected || frames++ > 60) {
      clearInterval(connection.outputTimer);
      return;
    }
    const pcm = Buffer.alloc(1920);
    for (let i = 0; i < 960; i++)
      pcm.writeInt16LE(
        Math.round(Math.sin((i + frames * 960) / 20) * 2000),
        i * 2,
      );
    connection.emit({
      type: "session.output_audio.delta",
      delta: pcm.toString("base64"),
    });
  }, 40);
};
const liveClient = fakeLive({
  greeting: (connection) => {
    say(connection, "你好，請直接用語音和我聊聊。", "persona");
    play(connection);
  },
  connect: (connection) => {
    const append = connection.appendAudio.bind(connection);
    connection.appendAudio = (bytes) => {
      append(bytes);
      if (!connection.captured) {
        connection.captured = true;
        say(connection, "我想先瞭解情況。");
      }
    };
    const disconnect = connection.disconnect.bind(connection);
    connection.disconnect = () => {
      clearInterval(connection.outputTimer);
      disconnect();
    };
  },
});
const app = await createApp(engine, {
  liveClient,
  voiceOptions: { checkpointMs: 100, closeMs: 100 },
});
// Test-only controls; production never imports this server or its fake provider.
app.get("/__test/voice", async () => ({
  attempts: liveClient.connections.length,
  connections: liveClient.connections.map((c) => ({
    frames: c.inputs.length,
    muted: c.mutes.at(-1) || false,
    disconnected: c.disconnected,
    greetings: c.instructions.length,
    nonzero: c.inputs.some((b) => b.some((v) => v !== 0)),
  })),
}));
app.post("/__test/voice", async (req) => {
  const connection = liveClient.connections.at(-1);
  if (req.body.action === "say")
    say(connection, req.body.text, req.body.speaker);
  else if (req.body.action === "play") play(connection);
  else if (req.body.action === "delegate")
    connection.emit({
      type: "session.delegation.created",
      delegation: { target: "client", id: `delegate-${++transcriptSequence}` },
    });
  else if (req.body.action === "disconnect") connection.disconnect();
  else if (req.body.action === "duration") {
    const s = store.get(req.body.id);
    s.plot.maxVoiceSecondsPerCall = req.body.seconds;
    store.save(s);
  }
  return { ok: true };
});
await app.listen({ host: "127.0.0.1", port: 3100 });
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });

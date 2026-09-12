import { afterEach, expect, it } from "vitest";
import { setTimeout as delay } from "node:timers/promises";
import { VoiceCoordinator } from "../apps/server/src/voice.js";
import { harness, ready, until, deferred } from "./support/fixtures.js";
import { fakeLive, fakeSocket, transcript } from "./support/voice.js";
const cleanup = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
const keep = {
  stop: false,
  reason: "需更多資料",
  evidenceIds: [],
};
async function setup({ agents, provider, limits, voiceFirst = false } = {}) {
  const h = harness(agents),
    client = fakeLive(provider);
  const media = new VoiceCoordinator(h.engine, {
    client,
    checkpointMs: 10000,
    closeMs: 40,
    jobMs: 200,
    ...limits,
  });
  cleanup.push(async () => {
    h.engine.dispose();
    await media.dispose();
    h.store.close();
  });
  let id, callId;
  if (voiceFirst) {
    id = h.engine.start("anti-fraud");
    await until(() => h.store.get(id).state === "awaiting_call");
    callId = h.engine.accept(id, h.store.get(id).pendingAssignmentId, "voice");
  } else ({ id, callId } = await ready(h));
  const attach = async () => {
    const reservation = media.reserve(id, callId, crypto.randomUUID()),
      socket = fakeSocket();
    const item = media.attach(
      id,
      callId,
      reservation.voiceId,
      reservation.token,
      socket,
    );
    await until(() => item.status !== "starting");
    return { item, socket, connection: client.connections.at(-1) };
  };
  return { ...h, media, client, id, callId, attach };
}
it("voice-first skips text generation, starts one greeting after readiness, and persists early captions/audio", async () => {
  const h = await setup({
    voiceFirst: true,
    provider: {
      early: [
        transcript("先到", "user"),
        {
          type: "session.output_audio.delta",
          delta: Buffer.alloc(1920).toString("base64"),
        },
        {
          type: "session.updated",
          session: { instructions: "PRIVATE_SENTINEL" },
        },
      ],
    },
  });
  const { item, socket, connection } = await h.attach();
  expect(h.agents.calls.map((c) => c.kind)).toEqual(["plan"]);
  expect(connection.instructions).toHaveLength(1);
  expect(socket.sent.findIndex((e) => e.type === "ready")).toBeLessThan(
    socket.sent.findIndex(Buffer.isBuffer),
  );
  expect(socket.sent.some((e) => e.fragment?.delta === "先到")).toBe(true);
  expect(JSON.stringify(socket.sent)).not.toContain("PRIVATE_SENTINEL");
  expect(() =>
    h.engine.send(h.id, h.callId, "typed", "拒絕同時文字"),
  ).toThrow();
  connection.emit(transcript("語音開場", "persona"));
  await h.media.stop(item);
  expect(h.store.get(h.id).calls[0].inputMode).toBe("text");
  expect(h.store.get(h.id).recaps).toHaveLength(0);
  const second = await h.attach();
  expect(second.connection.instructions).toHaveLength(0);
});
it("coalesces new evidence behind a running Judge without blocking audio or starving its result", async () => {
  const first = deferred(),
    calls = [];
  const h = await setup({
    agents: {
      watch: (context) => {
        calls.push(context);
        return calls.length === 1 ? first.promise : keep;
      },
    },
  });
  const { item, connection, socket } = await h.attach();
  connection.emit(transcript("第一段", "user", 0));
  h.media.checkpoint(item);
  await until(() => calls.length === 1);
  for (let i = 1; i <= 5; i++) {
    connection.emit(transcript(`第${i}段`, "user", i * 40));
    h.media.checkpoint(item);
  }
  connection.emit({
    type: "session.output_audio.delta",
    delta: Buffer.alloc(1920).toString("base64"),
  });
  expect(socket.sent.some(Buffer.isBuffer)).toBe(true);
  expect(calls).toHaveLength(1);
  first.resolve(keep);
  await until(() => h.store.get(h.id).watches.length === 2);
  expect(calls).toHaveLength(2);
  expect(calls[1].messages.filter((m) => m.source === "voice")).toHaveLength(6);
  expect(calls[1].voiceEvidence).toContain("不一定是完整回答");
  expect(h.agents.calls.filter((c) => c.kind === "reply")).toHaveLength(1);
});
it("sends a completed ATM action to the active Judge immediately and only deducts it once", async () => {
  const contexts = [];
  const h = await setup({
    voiceFirst: true,
    agents: {
      watch: (context) => {
        contexts.push(context);
        return keep;
      },
    },
  });
  await h.attach();
  const first = h.engine.atmAction(
    h.id,
    h.callId,
    "atm-action-1",
    "transfer",
    1250,
    "1234 5678",
  );
  await until(() => contexts.length === 1);
  await until(() => h.store.get(h.id).watches.length === 1);
  expect(first.balance).toBe(98750);
  expect(contexts[0].messages.at(-1)).toMatchObject({
    id: first.messageId,
    source: "atm",
    action: "transfer",
    amount: 1250,
    recipientLast4: "5678",
    balanceAfter: 98750,
  });
  expect(
    h.engine.atmAction(
      h.id,
      h.callId,
      "atm-action-1",
      "transfer",
      1250,
      "12345678",
    ),
  ).toEqual(first);
  expect(
    h.store.get(h.id).messages.filter((message) => message.source === "atm"),
  ).toHaveLength(1);
  expect(() =>
    h.engine.atmAction(h.id, h.callId, "atm-action-2", "withdraw", 100000),
  ).toThrow("餘額不足");
});
it("returning to text drains the final Judge and ignores provider text beyond the cutoff", async () => {
  const gate = deferred();
  const h = await setup({ agents: { watch: () => gate.promise } });
  const { item, connection } = await h.attach();
  connection.emit(transcript("必須評估", "user"));
  const stopping = h.media.stop(item);
  connection.emit(transcript("太晚", "user"));
  await until(() => h.agents.calls.some((c) => c.kind === "watch"));
  expect(h.store.get(h.id).calls[0].inputMode).toBe("voice");
  expect(() => h.engine.send(h.id, h.callId, "too-soon", "等待")).toThrow();
  gate.resolve(keep);
  await stopping;
  expect(h.store.get(h.id).calls[0].inputMode).toBe("text");
  expect(h.store.get(h.id).messages.at(-1).text).toBe("必須評估");
  expect(h.store.voice.get(h.id, item.id)).toMatchObject({
    finalized: true,
    usage: { seconds: 1.25 },
  });
});
it.each(["invalid", "timeout"])(
  "required Judge %s fails the exercise with sealed evidence",
  async (failure) => {
    const h = await setup({
      agents: {
        watch: () =>
          failure === "invalid"
            ? { ...keep, evidenceIds: ["invented"] }
            : new Promise(() => {}),
      },
      limits: { jobMs: 30 },
    });
    const { item, connection } = await h.attach();
    connection.emit(transcript("回答"));
    h.media.checkpoint(item);
    await until(() => h.store.get(h.id).state === "failed");
    expect(h.store.get(h.id).error.code).toBe("VOICE_EVALUATION");
    expect(h.store.get(h.id).messages.at(-1).text).toBe("回答");
    await item.stopping;
    expect(connection.disconnected).toBe(true);
  },
);
it("delegation uses scoped assistance once, returns quiet context, and cannot replay a backend answer", async () => {
  const h = await setup(),
    { item, connection } = await h.attach();
  const event = {
    type: "session.delegation.created",
    delegation: {
      id: "DELEGATION_NOT_TASK",
      target: "client",
      task: "PRIVATE_SENTINEL",
    },
  };
  connection.emit(event);
  connection.emit(event);
  await until(() => connection.thinking.length === 1);
  const jobs = h.agents.calls.filter((c) => c.kind === "voiceAssist");
  expect(jobs).toHaveLength(1);
  expect(JSON.stringify(jobs)).not.toMatch(
    /PRIVATE_SENTINEL|DELEGATION_NOT_TASK|criteria/,
  );
  expect(connection.thinking[0].args.delegationId).toBe("DELEGATION_NOT_TASK");
  expect(h.store.get(h.id).messages).toHaveLength(1);
  expect(item.delegationIds.size).toBe(1);
});
it("validated Persona hangup and competing manual stops yield one Recap with fixed evidence", async () => {
  const gate = deferred();
  const h = await setup({ agents: { voiceAssist: () => gate.promise } });
  const { connection, item } = await h.attach();
  connection.emit(transcript("明天再聊"));
  connection.emit({
    type: "session.delegation.created",
    delegation: { target: "client", id: "hangup" },
  });
  await until(() => h.agents.calls.some((c) => c.kind === "voiceAssist"));
  gate.resolve({ context: "", requestHangup: true });
  await until(() => !!h.store.get(h.id).calls[0].endedAt);
  h.engine.closeCall(h.id, h.callId);
  connection.emit(transcript("不納入"));
  await until(() => h.store.get(h.id).state === "awaiting_call");
  await item.stopping;
  const state = h.store.get(h.id);
  expect(state.calls[0].endReason).toBe("persona");
  expect(state.recaps).toHaveLength(1);
  expect(state.messages.at(-1).text).toBe("明天再聊");
  expect(
    h.agents.calls.find((c) => c.kind === "recap").context.voiceEvidence,
  ).toContain("已聽完整句");
});
it("manual finish cancels late Judge/assistance results before Recap/report snapshots", async () => {
  const judge = deferred(),
    assist = deferred();
  const h = await setup({
    agents: { watch: () => judge.promise, voiceAssist: () => assist.promise },
  });
  const { item, connection } = await h.attach();
  connection.emit(transcript("最後接受的話"));
  h.media.checkpoint(item);
  connection.emit({
    type: "session.delegation.created",
    delegation: { target: "client", id: "pending" },
  });
  await until(() => h.agents.calls.some((c) => c.kind === "voiceAssist"));
  h.engine.finish(h.id);
  connection.emit(transcript("過時的話"));
  judge.resolve({
    ...keep,
    stop: true,
    evidenceIds: [h.store.get(h.id).messages.at(-1).id],
  });
  assist.resolve({ context: "過時指令", requestHangup: true });
  await until(() => h.store.get(h.id).state === "completed");
  await item.stopping;
  const s = h.store.get(h.id);
  expect(s.calls[0].endReason).toBe("user_finish");
  expect(s.recaps).toHaveLength(1);
  expect(s.watches).toHaveLength(0);
  expect(connection.thinking).toHaveLength(0);
  expect(s.messages.at(-1).text).toBe("最後接受的話");
  expect(
    h.agents.calls.find((c) => c.kind === "report").context.voiceEvidence,
  ).toBeTruthy();
});
it("cumulative active duration includes muted time and multiple attempts while typed limits ignore checkpoints", async () => {
  const h = await setup();
  const s = h.store.get(h.id);
  s.plot.maxVoiceSecondsPerCall = 0.16;
  s.plot.maxUserTurnsPerCall = 1;
  h.store.save(s);
  const first = await h.attach();
  await delay(45);
  await h.media.stop(first.item);
  expect(
    h.store.voice.get(h.id, first.item.id).elapsedMs,
  ).toBeGreaterThanOrEqual(40);
  const second = await h.attach();
  expect(second.item.remainingMs).toBeLessThan(120);
  h.media.control(second.item, { type: "mute", muted: true });
  for (let i = 0; i < 4; i++) {
    second.connection.emit(transcript("好", "user", i * 40));
    h.media.checkpoint(second.item);
  }
  expect(h.store.get(h.id).state).toBe("in_call");
  await until(() => !!h.store.get(h.id).calls[0].endedAt);
  expect(h.store.get(h.id).calls[0].endReason).toBe("voice_duration_limit");
});
it("caps a legacy plot voice budget at ten minutes", async () => {
  const h = await setup();
  const s = h.store.get(h.id);
  s.plot.maxVoiceSecondsPerCall = 900;
  h.store.save(s);
  const reservation = h.media.reserve(h.id, h.callId, "legacy-budget");
  expect(h.media.items.get(reservation.voiceId).remainingMs).toBe(600000);
});
it("busy text work prevents voice reservation and missing owner falls back without a paid connection", async () => {
  const h = await setup({ limits: { reservationMs: 25 } });
  const reservation = h.media.reserve(h.id, h.callId, "same");
  expect(h.media.reserve(h.id, h.callId, "same")).toEqual(reservation);
  expect(() => h.media.reserve(h.id, h.callId, "other")).toThrow();
  await until(() => !h.media.items.size);
  expect(h.client.connections).toHaveLength(0);
  expect(() => h.media.reserve(h.id, h.callId, "same")).toThrow();
  expect(() =>
    h.media.attach(
      h.id,
      h.callId,
      reservation.voiceId,
      reservation.token,
      fakeSocket(),
    ),
  ).toThrow();
  h.engine.send(h.id, h.callId, "typed", "你好");
  expect(() => h.media.reserve(h.id, h.callId, "busy")).toThrow();
});
it("multiple voice checkpoints do not consume the text turn budget", async () => {
  const h = await setup(),
    { item, connection } = await h.attach();
  const s = h.store.get(h.id);
  s.plot.maxUserTurnsPerCall = 2;
  h.store.save(s);
  for (let i = 0; i < 4; i++) {
    connection.emit(transcript("片段", "user", i * 40));
    h.media.checkpoint(item);
  }
  await h.media.stop(item);
  h.engine.send(h.id, h.callId, "first", "文字第一回合");
  await until(() => !h.store.get(h.id).busy);
  expect(h.store.get(h.id).calls[0].endedAt).toBeNull();
  h.engine.send(h.id, h.callId, "second", "文字第二回合");
  await until(() => !!h.store.get(h.id).calls[0].endedAt);
  expect(h.store.get(h.id).calls[0].endReason).toBe("turn_limit");
});
it("provider authentication failure and voice-first owner expiry return to one text opening", async () => {
  const h = await setup({
    voiceFirst: true,
    provider: {
      connect: () => {
        throw { code: "LIVE_AUTH", message: "PRIVATE_KEY_SENTINEL" };
      },
    },
  });
  const { item } = await h.attach();
  await item.stopping;
  await until(() => !h.store.get(h.id).busy);
  expect(h.store.voice.get(h.id, item.id).errorCode).toBe("VOICE_AUTH");
  expect(h.store.get(h.id).messages).toHaveLength(1);
  expect(JSON.stringify(h.engine.view(h.id))).not.toContain(
    "PRIVATE_KEY_SENTINEL",
  );
  const waiting = await setup({
    voiceFirst: true,
    limits: { reservationMs: 15 },
  });
  await until(
    () => waiting.store.get(waiting.id).calls[0].inputMode === "text",
  );
  await until(() => !waiting.store.get(waiting.id).busy);
  expect(waiting.store.get(waiting.id).messages).toHaveLength(1);
  expect(waiting.client.connections).toHaveLength(0);
});
it("delegation backlog is bounded even when assistance ignores cancellation", async () => {
  const h = await setup({
    agents: { voiceAssist: () => new Promise(() => {}) },
  });
  const { item, connection } = await h.attach();
  for (let i = 0; i < 7; i++)
    connection.emit({
      type: "session.delegation.created",
      delegation: { target: "client", id: `overload-${i}` },
    });
  await item.stopping;
  expect(h.store.voice.get(h.id, item.id).errorCode).toBe("VOICE_BACKPRESSURE");
  expect(connection.thinking).toHaveLength(0);
});
it("lost heartbeat and hung finalization are bounded; startup cancellation disposes a late provider", async () => {
  const h = await setup({
    provider: { close: () => new Promise(() => {}) },
    limits: { ownerTimeoutMs: 25, closeMs: 15 },
  });
  const { item, connection } = await h.attach();
  await until(() => !h.media.items.size);
  expect(connection.disconnected).toBe(true);
  expect(h.store.voice.get(h.id, item.id).finalized).toBe(false);
  const gate = deferred(),
    second = await setup({ provider: { connect: () => gate.promise } });
  const r = second.media.reserve(second.id, second.callId, "cancel");
  const pending = second.media.attach(
    second.id,
    second.callId,
    r.voiceId,
    r.token,
    fakeSocket(),
  );
  await until(() => second.client.connections.length === 1);
  await second.media.stop(pending);
  gate.resolve();
  await until(() => second.client.connections[0].disconnected);
  expect(second.store.get(second.id).calls[0].inputMode).toBe("text");
});
it("bounded queues shed transient media overflow and reject invalid control", async () => {
  const h = await setup(),
    { item, socket, connection } = await h.attach();
  expect(() =>
    h.media.attach(h.id, h.callId, item.id, "wrong", fakeSocket()),
  ).toThrow();
  expect(() =>
    h.media.control(item, { type: "transcript", text: "fake" }),
  ).toThrow();
  expect(() => h.media.audio(item, Buffer.alloc(3))).toThrow();
  connection.appendAudio = () => {
    throw { code: "LIVE_BACKPRESSURE" };
  };
  expect(() => h.media.audio(item, Buffer.alloc(1920))).not.toThrow();
  socket.bufferedAmount = 384000;
  connection.emit({
    type: "session.output_audio.delta",
    delta: Buffer.alloc(1920).toString("base64"),
  });
  expect(item.frozen).not.toBe(true);
  expect(socket.sent.filter(Buffer.isBuffer)).toHaveLength(0);
  socket.bufferedAmount = 0;
  connection.emit({
    type: "session.output_audio.delta",
    delta: Buffer.alloc(1920).toString("base64"),
  });
  expect(socket.sent.filter(Buffer.isBuffer)).toHaveLength(1);
});

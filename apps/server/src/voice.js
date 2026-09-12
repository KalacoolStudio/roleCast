import { randomUUID, randomBytes, timingSafeEqual } from "node:crypto";
import { createGptLiveClient, decodeAudio } from "@role-cast/gpt-live";
import {
  AppError,
  conflict,
  validateResult,
} from "../../../packages/core/src/contracts.js";
import { prompts, roleContext } from "../../../packages/core/src/agents.js";
import { liveSessionOptions } from "../../../packages/core/src/voice-context.js";

const defaultWorkspaceId = "default";

export const voiceError = (code = "VOICE_UNAVAILABLE") =>
  new AppError(
    code,
    {
      VOICE_UNAVAILABLE: "語音連線無法使用，請稍後重新開啟語音。",
      VOICE_AUTH: "語音模型驗證失敗，請檢查後端 OpenAI 設定。",
      VOICE_PROTOCOL: "語音資料格式不正確，連線已停止。",
      VOICE_BACKPRESSURE: "語音連線跟不上播放或收音速度，請重新開啟語音。",
      VOICE_TIMEOUT: "語音連線逾時，請重新開啟語音。",
      VOICE_EVALUATION: "語音評估未完成，演練已停止並保留紀錄。",
    }[code] || "語音連線已停止。",
    503,
  );
const failureCode = (error) =>
  error?.code === "LIVE_AUTH"
    ? "VOICE_AUTH"
    : error?.code === "LIVE_BACKPRESSURE"
      ? "VOICE_BACKPRESSURE"
      : error?.code === "LIVE_TIMEOUT"
        ? "VOICE_TIMEOUT"
        : "VOICE_UNAVAILABLE";
const ended = (item) =>
  ["closed", "failed", "interrupted"].includes(item.status);
const RELAY_HIGH_WATER_BYTES = 384000;
const EARLY_AUDIO_MAX_BYTES = 192000;

const normalizeClosingSpeech = (text) =>
  text
    .normalize("NFKC")
    .replace(/[\s，。！？、,.!?；;：:“”"'「」『』（）()…—-]/gu, "");
const participantEndedCall = (text) => {
  if (/(?:不要|別|不能|不可以|先別|請勿|不).{0,6}(?:掛斷|結束)/u.test(text))
    return false;
  return (
    (text.length <= 32 &&
      /(?:先這樣(?:吧|了|囉)?|再見|拜拜|掰掰)(?:謝謝(?:你|您)?)?$/u.test(
        text,
      )) ||
    /(?:(?:請|麻煩|可以|幫我|我要|我想).{0,8})?(?:掛斷(?:吧|了)?|結束(?:這通)?(?:通話|電話))(?:謝謝)?$/u.test(
      text,
    )
  );
};
const personaEndedCall = (text) => {
  if (
    /(?:如何|怎麼|要不要|是否|請說|說明).{0,12}(?:再見|拜拜|掰掰)$/u.test(text)
  )
    return false;
  return /(?:先這樣(?:吧|了|囉)?|再見|拜拜|掰掰|感謝您(?:的)?(?:來電|配合)|謝謝您(?:的)?(?:來電|配合)|後續.{0,24}(?:再)?(?:與您)?聯繫|祝您(?:一切)?(?:順心|愉快|平安))$/u.test(
    text,
  );
};
const closingAcknowledgement = (text) =>
  /^(?:好|好的|好啊|可以|嗯好|謝謝|謝謝你|謝謝您|好謝謝|好的謝謝)$/u.test(text);

/** Return the participant evidence that establishes an explicit call boundary. */
export function conversationClosure(messages) {
  const spoken = messages.filter(
    (message) =>
      (message.speaker === "user" || message.speaker === "persona") &&
      message.source !== "atm" &&
      typeof message.text === "string" &&
      message.text.trim(),
  );
  let userIndex = spoken.findLastIndex((message) => message.speaker === "user");
  if (userIndex < 0) return null;

  const evidence = spoken[userIndex];
  const userParts = [];
  while (userIndex >= 0 && spoken[userIndex].speaker === "user")
    userParts.unshift(spoken[userIndex--].text);
  const userText = normalizeClosingSpeech(userParts.join(""));
  if (participantEndedCall(userText)) return evidence.id;

  const personaParts = [];
  while (userIndex >= 0 && spoken[userIndex].speaker === "persona")
    personaParts.unshift(spoken[userIndex--].text);
  const personaText = normalizeClosingSpeech(personaParts.join(""));
  return personaEndedCall(personaText) && closingAcknowledgement(userText)
    ? evidence.id
    : null;
}

/** Bound even injected providers that ignore AbortSignal; never expose their errors. */
export function bounded(run, signal, milliseconds, code = "VOICE_TIMEOUT") {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let done = false;
    const finish = (error, result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      if (error) reject(error);
      else resolve(result);
    };
    const cancel = () => {
      finish(voiceError(code));
      controller.abort();
    };
    const timer = setTimeout(cancel, milliseconds);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    Promise.resolve()
      .then(() => {
        if (!done) return run(controller.signal);
      })
      .then(
        (r) => finish(null, r),
        (e) => finish(e),
      );
  });
}

export class VoiceCoordinator {
  constructor(
    engine,
    {
      settings = { available: false, reason: "NOT_CONFIGURED" },
      client,
      reservationMs = 30000,
      checkpointMs = 1000,
      ownerTimeoutMs = 15000,
      closeMs = 15000,
      jobMs = 65000,
    } = {},
  ) {
    this.engine = engine;
    this.records = engine.store.voice;
    this.settings = settings;
    this.client =
      client ||
      (settings.available ? createGptLiveClient(settings.config) : null);
    this.limits = {
      reservationMs,
      checkpointMs,
      ownerTimeoutMs,
      closeMs,
      jobMs,
    };
    this.items = new Map();
    this.waiting = new Map();
    this.disposed = false;
    engine.media = this;
  }
  capabilities() {
    return {
      available: !!this.client,
      model: "gpt-live-1",
      ...(!this.client
        ? { reason: this.settings.reason || "NOT_CONFIGURED" }
        : {}),
    };
  }
  itemFor(id, callId, ownerId = defaultWorkspaceId) {
    return [...this.items.values()].find(
      (a) => a.ownerId === ownerId && a.sessionId === id && a.callId === callId,
    );
  }
  observeUserMessage(sessionId, callId, message, ownerId = defaultWorkspaceId) {
    const item = this.itemFor(sessionId, callId, ownerId);
    if (!item || item.frozen || !this.current(item)) return false;
    item.pendingUser = Math.max(item.pendingUser, message.sequence);
    this.send(item, { type: "checkpoint", messages: [message] });
    this.judge(item);
    return true;
  }
  current(item) {
    if (
      this.disposed ||
      this.engine.disposed ||
      this.items.get(item.id) !== item
    )
      return null;
    const s = this.engine.store.get(item.sessionId, item.ownerId);
    const call = s.calls.find((c) => c.id === item.callId);
    return s.state === "in_call" &&
      s.currentCallId === item.callId &&
      call &&
      !call.endedAt
      ? { s, call }
      : null;
  }
  awaitOwner(id, callId, ownerId = defaultWorkspaceId) {
    const key = `${ownerId}/${id}/${callId}`;
    clearTimeout(this.waiting.get(key));
    this.waiting.set(
      key,
      setTimeout(() => {
        this.waiting.delete(key);
        if (!this.itemFor(id, callId, ownerId) && !this.disposed)
          this.engine.returnToText(id, callId, ownerId);
      }, this.limits.reservationMs),
    );
  }
  reserve(sessionId, callId, requestId, ownerId = defaultWorkspaceId) {
    if (!this.client || this.disposed) throw voiceError();
    if (
      typeof requestId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(requestId)
    )
      throw conflict();
    const existing = this.itemFor(sessionId, callId, ownerId);
    if (existing) {
      if (
        existing.requestId === requestId &&
        !existing.socket &&
        !existing.frozen
      )
        return { voiceId: existing.id, token: existing.token };
      throw conflict();
    }
    const s = this.engine.store.get(sessionId, ownerId);
    const call = s.calls.find((c) => c.id === callId);
    if (
      s.state !== "in_call" ||
      s.currentCallId !== callId ||
      !call ||
      call.endedAt ||
      s.busy
    )
      throw conflict();
    const usedMs = this.records
      .attempts(sessionId, callId)
      .reduce((n, a) => n + (a.elapsedMs || 0), 0);
    if (
      this.records
        .attempts(sessionId, callId)
        .some((a) => a.requestId === requestId)
    )
      throw conflict();
    const remainingMs =
      Math.min(s.plot.maxVoiceSecondsPerCall ?? 600, 600) * 1000 - usedMs;
    if (remainingMs <= 0) {
      this.engine.closeCall(sessionId, callId, "voice_duration_limit", ownerId);
      throw conflict();
    }
    const item = {
      id: randomUUID(),
      ownerId,
      sessionId,
      callId,
      requestId,
      remainingMs,
      token: randomBytes(32).toString("hex"),
      status: "starting",
      sequence: 0,
      startup: new AbortController(),
      judgeAbort: new AbortController(),
      assistAbort: new AbortController(),
      pendingUser: 0,
      checkedUser: 0,
      delegationIds: new Set(),
      assistance: [],
    };
    this.engine.store.db.transaction(() => {
      call.inputMode = "voice";
      this.engine.store.save(s);
      this.records.create(sessionId, callId, item.id, requestId);
    })();
    clearTimeout(this.waiting.get(`${ownerId}/${sessionId}/${callId}`));
    this.waiting.delete(`${ownerId}/${sessionId}/${callId}`);
    this.items.set(item.id, item);
    item.expiry = setTimeout(
      () => this.stop(item, "VOICE_TIMEOUT"),
      this.limits.reservationMs,
    );
    return { voiceId: item.id, token: item.token };
  }
  attach(
    sessionId,
    callId,
    voiceId,
    token,
    socket,
    ownerId = defaultWorkspaceId,
  ) {
    const item = this.items.get(voiceId);
    if (
      !item ||
      item.sessionId !== sessionId ||
      item.callId !== callId ||
      item.ownerId !== ownerId ||
      item.socket ||
      item.frozen ||
      !this.current(item) ||
      typeof token !== "string" ||
      token.length !== item.token?.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(item.token))
    )
      throw conflict();
    item.token = null;
    item.socket = socket;
    clearTimeout(item.expiry);
    this.touch(item);
    item.checkpoints = setInterval(() => {
      try {
        if (!item.frozen) this.checkpoint(item);
      } catch {
        this.engine.fail(
          sessionId,
          voiceError("VOICE_EVALUATION"),
          item.ownerId,
        );
      }
    }, this.limits.checkpointMs);
    this.connect(item);
    return item;
  }
  async connect(item) {
    try {
      const current = this.current(item);
      if (!current) throw conflict();
      const options = liveSessionOptions(
        current.s,
        current.call,
        this.settings.voice,
      );
      const connection = await bounded(
        async (signal) => {
          const c = await this.client.connectWebSocket(options, {
            signal,
            onEvent: (e) => this.receive(item, e),
          });
          if (signal.aborted || item.frozen) {
            c.disconnect();
            throw voiceError();
          }
          return c;
        },
        item.startup.signal,
        this.limits.reservationMs,
      );
      item.live = connection;
      if (item.frozen || !this.current(item)) {
        connection.disconnect();
        return;
      }
      item.activeAt = Date.now();
      item.status = "active";
      this.records.update(item.sessionId, item.id, {
        status: "active",
        providerId: connection.sessionId,
        activeAt: new Date(item.activeAt).toISOString(),
      });
      item.duration = setTimeout(() => {
        if (this.current(item))
          this.engine.closeCall(
            item.sessionId,
            item.callId,
            "voice_duration_limit",
            item.ownerId,
          );
      }, item.remainingMs);
      connection.closed.then(
        () => {
          if (!item.frozen) this.stop(item, "VOICE_UNAVAILABLE");
        },
        (e) => {
          if (!item.frozen) this.stop(item, failureCode(e));
        },
      );
      this.send(item, { type: "ready" });
      for (const bytes of item.earlyAudio || []) this.output(item, bytes);
      item.earlyAudio = [];
      this.assist(item);
      const latest = this.current(item);
      if (
        latest &&
        !latest.s.messages.some(
          (m) => m.callId === item.callId && m.speaker === "persona",
        ) &&
        !latest.call.voiceGreetingRequested
      ) {
        latest.call.voiceGreetingRequested = true;
        this.engine.store.save(latest.s);
        await connection.appendInstructions(
          "現在立刻用繁體中文簡短自我介紹並提出第一個問題，不要等待使用者先說話。說完後停下來聆聽。",
          { delegationId: null, signal: item.assistAbort.signal },
        );
      }
    } catch (error) {
      if (!item.frozen) this.stop(item, failureCode(error));
    }
  }
  send(item, data) {
    if (!item.socket || item.socket.readyState !== 1) return;
    const payload = JSON.stringify({
      ...data,
      voiceId: item.id,
      sequence: ++item.sequence,
    });
    if (
      data.type !== "stopped" &&
      item.socket.bufferedAmount + Buffer.byteLength(payload) >
        RELAY_HIGH_WATER_BYTES
    ) {
      return;
    }
    item.socket.send(payload, (error) => {
      if (error) this.stop(item, "VOICE_UNAVAILABLE");
    });
  }
  touch(item) {
    clearTimeout(item.heartbeat);
    if (!item.frozen)
      item.heartbeat = setTimeout(
        () => this.stop(item, "VOICE_TIMEOUT"),
        this.limits.ownerTimeoutMs,
      );
  }
  control(item, event) {
    if (item.frozen) return;
    if (
      !event ||
      typeof event !== "object" ||
      Array.isArray(event) ||
      Object.keys(event).some((k) => !["type", "muted"].includes(k))
    )
      throw voiceError("VOICE_PROTOCOL");
    if (event.type === "heartbeat") {
      if (Object.keys(event).length !== 1) throw voiceError("VOICE_PROTOCOL");
      this.touch(item);
      this.send(item, { type: "heartbeat" });
      return;
    }
    if (event.type === "stop") {
      if (Object.keys(event).length !== 1) throw voiceError("VOICE_PROTOCOL");
      this.stop(item);
      return;
    }
    if (
      event.type !== "mute" ||
      typeof event.muted !== "boolean" ||
      item.status !== "active" ||
      item.muting
    )
      throw voiceError("VOICE_PROTOCOL");
    item.muting = true;
    const command = event.muted
      ? item.live.muteInput()
      : item.live.unmuteInput();
    command.then(
      () => {
        item.muting = false;
        if (!item.frozen)
          this.send(item, { type: "muted", muted: event.muted });
      },
      (error) => this.stop(item, failureCode(error)),
    );
  }
  audio(item, bytes) {
    if (item.frozen) return;
    if (
      item.status !== "active" ||
      !bytes.length ||
      bytes.length % 2 ||
      bytes.length > 5760
    )
      throw voiceError("VOICE_PROTOCOL");
    try {
      item.live.appendAudio(bytes);
    } catch (error) {
      if (error?.code !== "LIVE_BACKPRESSURE") throw error;
    }
  }
  receive(item, event) {
    if (item.frozen || !this.current(item)) return;
    if (
      [
        "session.input_transcript.delta",
        "session.output_transcript.delta",
      ].includes(event.type)
    ) {
      const fragment = this.records.ingest(item.sessionId, item.id, event);
      if (fragment) this.send(item, { type: "caption", fragment });
    } else if (event.type === "session.output_audio.delta") {
      const bytes = decodeAudio(event.delta);
      if (item.status === "starting") {
        item.earlyAudio ||= [];
        while (
          item.earlyAudio.length &&
          item.earlyAudio.reduce((n, v) => n + v.length, bytes.length) >
            EARLY_AUDIO_MAX_BYTES
        )
          item.earlyAudio.shift();
        if (bytes.length <= EARLY_AUDIO_MAX_BYTES) item.earlyAudio.push(bytes);
      } else this.output(item, bytes);
    } else if (
      event.type === "session.delegation.created" &&
      event.delegation?.target === "client"
    ) {
      const id = event.delegation.id;
      if (typeof id !== "string" || !id || id.length > 256)
        throw voiceError("VOICE_PROTOCOL");
      if (item.delegationIds.has(id)) return;
      if (item.assistance.length >= 4 || item.delegationIds.size >= 64) {
        this.stop(item, "VOICE_BACKPRESSURE");
        return;
      }
      item.delegationIds.add(id);
      item.assistance.push(id);
      if (item.status === "active") this.assist(item);
    } else if (event.type === "error")
      this.stop(item, failureCode(event.error));
  }
  output(item, bytes) {
    if (item.frozen || item.socket?.readyState !== 1) return;
    if (item.socket.bufferedAmount + bytes.length > RELAY_HIGH_WATER_BYTES) {
      return;
    }
    item.socket.send(bytes, (error) => {
      if (error) this.stop(item, "VOICE_UNAVAILABLE");
    });
  }
  checkpoint(item, final = false) {
    const messages = this.records.checkpoint(
      item.sessionId,
      item.id,
      final,
      item.ownerId,
    );
    if (messages.length && !item.frozen)
      this.send(item, { type: "checkpoint", messages });
    for (const m of messages)
      if (m.speaker === "user")
        item.pendingUser = Math.max(item.pendingUser, m.sequence);
    if (!final) this.judge(item);
    return messages;
  }
  closeOnConversationClosure(item) {
    if (item.pendingUser <= item.checkedUser) return false;
    const current = this.current(item);
    if (!current) return false;
    const context = roleContext("watch", current.s, current.call);
    const evidenceId = conversationClosure(context.messages);
    const evidence = context.messages.find(
      (message) => message.id === evidenceId,
    );
    if (!evidence || evidence.sequence <= item.checkedUser) return false;
    const through = item.pendingUser;
    const result = validateResult(
      "watch",
      {
        stop: true,
        reason: "雙方已明確結束對話。",
        evidenceIds: [evidenceId],
      },
      context,
    );
    current.s.watches.push({
      ...result,
      id: randomUUID(),
      callId: item.callId,
      voiceId: item.id,
      messageId: evidenceId,
      throughSequence: through,
    });
    this.engine.store.save(current.s);
    item.checkedUser = through;
    this.engine.closeCall(item.sessionId, item.callId, "judge", item.ownerId);
    return true;
  }
  judge(item) {
    if (this.closeOnConversationClosure(item))
      return item.judging || Promise.resolve();
    if (item.judging) return item.judging;
    item.judging = (async () => {
      while (
        !item.judgeAbort.signal.aborted &&
        item.pendingUser > item.checkedUser &&
        this.current(item)
      ) {
        if (this.closeOnConversationClosure(item)) return;
        const { s, call } = this.current(item);
        const context = roleContext("watch", s, call);
        const through = item.pendingUser;
        const result = validateResult(
          "watch",
          await bounded(
            (signal) =>
              this.engine.agents.run(
                "watch",
                context,
                signal,
                s.prompts.watch || prompts.watch,
              ),
            item.judgeAbort.signal,
            this.limits.jobMs,
            "VOICE_EVALUATION",
          ),
          context,
        );
        if (item.judgeAbort.signal.aborted || !this.current(item)) return;
        const latest = this.current(item).s;
        latest.watches.push({
          ...result,
          id: randomUUID(),
          callId: item.callId,
          voiceId: item.id,
          messageId:
            result.evidenceIds.at(-1) ||
            context.messages.filter((m) => m.speaker === "user").at(-1)?.id,
          throughSequence: through,
        });
        this.engine.store.save(latest);
        item.checkedUser = through;
        if (result.stop) {
          this.engine.closeCall(
            item.sessionId,
            item.callId,
            "judge",
            item.ownerId,
          );
          return;
        }
      }
    })()
      .catch(() => {
        if (!item.judgeAbort.signal.aborted && this.current(item))
          this.engine.fail(
            item.sessionId,
            voiceError("VOICE_EVALUATION"),
            item.ownerId,
          );
      })
      .finally(() => {
        item.judging = null;
      });
    return item.judging;
  }
  assist(item) {
    if (item.assisting) return;
    item.assisting = (async () => {
      while (!item.frozen && item.assistance.length && this.current(item)) {
        const delegationId = item.assistance.shift();
        this.checkpoint(item);
        const { s, call } = this.current(item);
        const context = roleContext("voiceAssist", s, call);
        const result = validateResult(
          "voiceAssist",
          await bounded(
            (signal) =>
              this.engine.agents.run(
                "voiceAssist",
                context,
                signal,
                s.prompts.voiceAssist || prompts.voiceAssist,
              ),
            item.assistAbort.signal,
            this.limits.jobMs,
          ),
          context,
        );
        if (item.frozen || !this.current(item)) return;
        if (result.requestHangup) {
          this.engine.closeCall(
            item.sessionId,
            item.callId,
            "persona",
            item.ownerId,
          );
          return;
        }
        if (result.context.trim())
          await item.live.appendThinking(result.context, {
            delegationId,
            signal: item.assistAbort.signal,
          });
      }
    })()
      .catch(() => {
        if (!item.frozen) this.stop(item, "VOICE_UNAVAILABLE");
      })
      .finally(() => {
        item.assisting = null;
      });
  }
  seal(sessionId, callId, ownerId = defaultWorkspaceId) {
    const item = this.itemFor(sessionId, callId, ownerId);
    if (!item || item.frozen) return;
    item.frozen = true;
    item.sealedAt = Date.now();
    item.status = "stopping";
    clearTimeout(item.expiry);
    clearTimeout(item.heartbeat);
    clearTimeout(item.duration);
    clearInterval(item.checkpoints);
    item.assistAbort.abort();
    item.startup.abort();
    this.checkpoint(item, true);
    this.records.update(sessionId, item.id, { status: "stopping" });
  }
  callEnded(sessionId, callId, ownerId = defaultWorkspaceId) {
    clearTimeout(this.waiting.get(`${ownerId}/${sessionId}/${callId}`));
    this.waiting.delete(`${ownerId}/${sessionId}/${callId}`);
    const item = this.itemFor(sessionId, callId, ownerId);
    if (item) {
      item.judgeAbort.abort();
      this.stop(item);
    }
  }
  stop(item, errorCode) {
    if (item.stopping) return item.stopping;
    this.seal(item.sessionId, item.callId, item.ownerId);
    item.stopping = Promise.resolve()
      .then(async () => {
        let final;
        if (item.live) {
          try {
            final = await bounded(
              () => item.live.close(),
              undefined,
              this.limits.closeMs,
            );
          } catch {
            /* final usage remains unconfirmed */
          } finally {
            item.live.disconnect();
          }
        }
        if (!item.judgeAbort.signal.aborted && this.current(item)) {
          await this.judge(item);
          if (item.pendingUser > item.checkedUser && this.current(item))
            await this.judge(item);
        }
        item.status = errorCode ? "failed" : "closed";
        this.records.update(item.sessionId, item.id, {
          status: item.status,
          endedAt: new Date(item.sealedAt).toISOString(),
          elapsedMs: item.activeAt
            ? Math.min(item.sealedAt - item.activeAt, item.remainingMs)
            : 0,
          reason: errorCode
            ? "interrupted"
            : final?.finalized
              ? "finalized"
              : "local_stop",
          errorCode,
          finalized: final?.finalized === true,
          ...(final?.usage ? { usage: { seconds: final.usage.seconds } } : {}),
        });
        this.items.delete(item.id);
        if (!this.disposed)
          this.engine.returnToText(item.sessionId, item.callId, item.ownerId);
      })
      .catch(() => {
        this.items.delete(item.id);
        if (!this.disposed && !this.engine.disposed)
          this.engine.fail(
            item.sessionId,
            voiceError("VOICE_EVALUATION"),
            item.ownerId,
          );
      });
    this.send(item, {
      type: "stopped",
      ...(errorCode
        ? { error: { code: errorCode, message: voiceError(errorCode).message } }
        : {}),
    });
    item.socket?.close();
    return item.stopping;
  }
  async dispose() {
    this.disposed = true;
    for (const timer of this.waiting.values()) clearTimeout(timer);
    this.waiting.clear();
    await Promise.all(
      [...this.items.values()]
        .filter((item) => !ended(item))
        .map((item) => {
          item.judgeAbort.abort();
          return this.stop(item);
        }),
    );
  }
}

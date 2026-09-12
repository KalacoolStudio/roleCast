import { randomUUID } from "node:crypto";
import {
  AppError,
  conflict,
  inputText,
  missing,
  terminal,
  validateResult,
} from "./contracts.js";
import { effectivePrompts, roleContext } from "./agents.js";
import { builtInPlots as defaults } from "./plots.js";
import { publicPlot } from "./plot-contracts.js";

const now = () => new Date().toISOString();
const defaultWorkspaceId = "default";
const initialAtmBalance = 100000;
const amountText = (amount) => `NT$${amount.toLocaleString("en-US")}`;
export class Engine {
  constructor(store, agents, plots = defaults) {
    this.store = store;
    this.agents = agents;
    this.plots = plots;
    this.store.seedPlots(plots);
    this.jobs = new Map();
    this.pending = new Set();
    this.disposed = false;
    this.media = null;
  }
  current(token) {
    if (this.disposed) return null;
    const s = this.store.get(token.id, token.ownerId);
    return s.version === token.version && !terminal(s.state) ? s : null;
  }
  launch(s, state, work) {
    this.jobs.get(s.id)?.controller.abort();
    s.state = state;
    s.version++;
    s.updatedAt = now();
    this.store.save(s);
    const token = {
      id: s.id,
      ownerId: s.ownerId,
      version: s.version,
      controller: new AbortController(),
    };
    this.jobs.set(s.id, token);
    const promise = Promise.resolve()
      .then(() => {
        if (this.current(token)) return work(token);
      })
      .catch((error) => {
        const latest = this.current(token);
        if (!latest) return;
        token.controller.abort();
        this.fail(latest.id, error, latest.ownerId);
      })
      .finally(() => {
        this.pending.delete(promise);
        if (this.jobs.get(s.id) === token) this.jobs.delete(s.id);
      });
    this.pending.add(promise);
  }
  async invoke(kind, s, token, call = null) {
    const context = roleContext(kind, s, call);
    const result = await this.agents.run(
      kind,
      context,
      token.controller.signal,
      s.prompts[kind],
    );
    return validateResult(kind, result, context);
  }
  ensureWorkspace(ownerId) {
    this.store.seedPlots(this.plots, ownerId);
  }
  start(plotId, background = "", ownerId = defaultWorkspaceId) {
    const plot = this.store.getPlot(plotId, ownerId);
    const s = {
      id: randomUUID(),
      ownerId,
      state: "planning",
      version: 0,
      createdAt: now(),
      updatedAt: now(),
      plot: structuredClone(plot),
      prompts: effectivePrompts(plot),
      background: inputText(background, 2000, true),
      busy: false,
      finishRequested: false,
      error: null,
      currentCallId: null,
      pendingAssignmentId: null,
      personas: [],
      assignments: [],
      calls: [],
      messages: [],
      watches: [],
      recaps: [],
      report: null,
      atm: { balance: initialAtmBalance },
    };
    this.store.create(s);
    this.plan(s);
    return s.id;
  }
  plan(s) {
    if (s.finishRequested || s.calls.length >= s.plot.maxCalls) {
      this.report(s);
      return;
    }
    this.launch(s, "planning", async (token) => {
      const result = await this.invoke("plan", s, token);
      const latest = this.current(token);
      if (!latest) return;
      if (result.action === "finish") {
        this.report(latest);
        return;
      }
      const personaId =
        result.action === "create" ? result.persona.id : result.personaId;
      if (result.action === "create") latest.personas.push(result.persona);
      const assignment = {
        id: randomUUID(),
        personaId,
        goal: result.goal,
        sharedMessageIds: result.sharedMessageIds,
      };
      latest.assignments.push(assignment);
      latest.pendingAssignmentId = assignment.id;
      latest.state = "awaiting_call";
      latest.busy = false;
      this.store.save(latest);
    });
  }
  accept(id, assignmentId, mode = "text", ownerId = defaultWorkspaceId) {
    if (!["text", "voice"].includes(mode)) throw conflict();
    const s = this.store.get(id, ownerId);
    const previous = s.calls.find((c) => c.assignmentId === assignmentId);
    if (previous) return previous.id;
    if (s.state !== "awaiting_call" || s.pendingAssignmentId !== assignmentId)
      throw conflict();
    const a = s.assignments.find((item) => item.id === assignmentId);
    const call = {
      id: randomUUID(),
      assignmentId,
      personaId: a.personaId,
      ordinal: s.calls.length + 1,
      startedAt: now(),
      endedAt: null,
      endReason: null,
      inputMode: mode,
    };
    s.calls.push(call);
    s.currentCallId = call.id;
    s.pendingAssignmentId = null;
    if (mode === "voice") {
      s.state = "in_call";
      s.busy = false;
      s.version++;
      this.store.save(s);
      this.media?.awaitOwner(id, call.id, ownerId);
    } else this.openText(s, call);
    return call.id;
  }
  openText(s, call) {
    s.busy = true;
    this.launch(s, "in_call", async (token) => {
      const reply = await this.invoke("reply", s, token, call);
      const latest = this.current(token);
      if (!latest) return;
      this.addReply(latest, call.id, reply.text);
      latest.busy = false;
      this.store.save(latest);
      if (reply.requestHangup)
        this.closeCall(s.id, call.id, "persona", s.ownerId);
    });
  }
  returnToText(id, callId, ownerId = defaultWorkspaceId) {
    if (this.disposed) return;
    const s = this.store.get(id, ownerId);
    const call = s.calls.find((c) => c.id === callId);
    if (
      !call ||
      call.endedAt ||
      s.currentCallId !== callId ||
      s.state !== "in_call"
    )
      return;
    call.inputMode = "text";
    this.store.save(s);
    if (
      !s.messages.some((m) => m.callId === callId && m.speaker === "persona") &&
      !s.busy
    )
      this.openText(s, call);
  }
  fail(id, error, ownerId = defaultWorkspaceId) {
    if (this.disposed) return;
    let s = this.store.get(id, ownerId);
    if (terminal(s.state)) return;
    this.media?.seal(id, s.currentCallId, ownerId);
    s = this.store.get(id, ownerId);
    this.jobs.get(id)?.controller.abort();
    s.state = "failed";
    s.version++;
    s.busy = false;
    s.error = {
      code: error instanceof AppError ? error.code : "INTERNAL_ERROR",
      message:
        error instanceof AppError
          ? error.message
          : "處理未完成。紀錄已保留，請開始新的演練。",
    };
    for (const call of s.calls.filter((c) => !c.endedAt)) {
      call.endReason = "failed";
      call.endedAt = now();
    }
    this.store.save(s);
    this.media?.callEnded(id, s.currentCallId, ownerId);
  }
  addReply(s, callId, text) {
    s.messages.push({
      id: randomUUID(),
      callId,
      speaker: "persona",
      text,
      sequence: s.messages.length + 1,
      createdAt: now(),
    });
  }
  send(id, callId, clientMessageId, text, ownerId = defaultWorkspaceId) {
    const s = this.store.get(id, ownerId);
    text = inputText(text, 4000);
    clientMessageId = inputText(clientMessageId, 100);
    const previous = s.messages.find(
      (m) => m.clientMessageId === clientMessageId,
    );
    if (previous) {
      if (previous.text !== text || previous.callId !== callId)
        throw conflict();
      return previous.id;
    }
    if (!s.calls.some((c) => c.id === callId)) throw missing();
    if (s.state !== "in_call" || s.currentCallId !== callId || s.busy)
      throw conflict();
    const call = s.calls.find((c) => c.id === callId);
    if (call.endedAt || (call.inputMode && call.inputMode !== "text"))
      throw conflict();
    const message = {
      id: randomUUID(),
      callId,
      clientMessageId,
      speaker: "user",
      text,
      sequence: s.messages.length + 1,
      createdAt: now(),
    };
    s.messages.push(message);
    s.busy = true;
    this.launch(s, "in_call", async (token) => {
      // Attach a rejection handler immediately: a slow Judge must not hide a Persona failure.
      const replyPromise = this.invoke("reply", s, token, call);
      const watchPromise = this.invoke("watch", s, token, call);
      const replyFailure = replyPromise.then(() => new Promise(() => {}));
      const watch = await Promise.race([watchPromise, replyFailure]);
      let latest = this.current(token);
      if (!latest) return;
      latest.watches.push({
        ...watch,
        id: randomUUID(),
        callId,
        messageId: message.id,
      });
      this.store.save(latest);
      if (watch.stop) {
        this.closeCall(id, callId, "judge", ownerId);
        return;
      }
      const reply = await replyPromise;
      latest = this.current(token);
      if (!latest) return;
      this.addReply(latest, callId, reply.text);
      latest.busy = false;
      this.store.save(latest);
      const turnCount = latest.messages.filter(
        (m) =>
          m.callId === callId &&
          m.speaker === "user" &&
          !["voice", "atm"].includes(m.source),
      ).length;
      if (reply.requestHangup || turnCount >= latest.plot.maxUserTurnsPerCall)
        this.closeCall(
          id,
          callId,
          reply.requestHangup ? "persona" : "turn_limit",
          ownerId,
        );
    });
    return message.id;
  }
  atmAction(
    id,
    callId,
    clientActionId,
    action,
    amount,
    recipient,
    ownerId = defaultWorkspaceId,
  ) {
    clientActionId = inputText(clientActionId, 100);
    if (!["transfer", "withdraw"].includes(action))
      throw new AppError("INVALID_INPUT", "ATM 操作不正確。", 400);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000000)
      throw new AppError(
        "INVALID_INPUT",
        "ATM 金額需為 1 至 10,000,000 的整數。",
        400,
      );
    let recipientLast4 = null;
    if (action === "transfer") {
      recipient = inputText(recipient, 64).replace(/[ -]/g, "");
      if (!/^\d{4,32}$/.test(recipient))
        throw new AppError("INVALID_INPUT", "收款帳號格式不正確。", 400);
      recipientLast4 = recipient.slice(-4);
    }
    const s = this.store.get(id, ownerId);
    const previous = s.messages.find(
      (message) => message.clientMessageId === clientActionId,
    );
    if (previous) {
      if (
        previous.source !== "atm" ||
        previous.callId !== callId ||
        previous.action !== action ||
        previous.amount !== amount ||
        previous.recipientLast4 !== recipientLast4
      )
        throw conflict();
      return { messageId: previous.id, balance: previous.balanceAfter };
    }
    const call = s.calls.find((candidate) => candidate.id === callId);
    if (
      !call ||
      call.endedAt ||
      s.state !== "in_call" ||
      s.currentCallId !== callId
    )
      throw conflict();
    const balance = Number.isSafeInteger(s.atm?.balance)
      ? s.atm.balance
      : initialAtmBalance;
    if (amount > balance)
      throw new AppError(
        "INSUFFICIENT_FUNDS",
        "餘額不足，請調整操作金額。",
        409,
      );
    const balanceAfter = balance - amount;
    const text =
      action === "transfer"
        ? `【ATM 操作】使用者已匯款 ${amountText(amount)} 至收款帳號末四碼 ${recipientLast4}；操作後餘額 ${amountText(balanceAfter)}。`
        : `【ATM 操作】使用者已提款 ${amountText(amount)}；操作後餘額 ${amountText(balanceAfter)}。`;
    const message = {
      id: randomUUID(),
      callId,
      clientMessageId: clientActionId,
      speaker: "user",
      source: "atm",
      action,
      amount,
      recipientLast4,
      balanceAfter,
      text,
      sequence: s.messages.length + 1,
      createdAt: now(),
    };
    s.atm = { balance: balanceAfter };
    s.messages.push(message);
    this.store.save(s);
    this.media?.observeUserMessage(id, callId, message, ownerId);
    return { messageId: message.id, balance: balanceAfter };
  }
  closeCall(id, callId, reason = "user", ownerId = defaultWorkspaceId) {
    let s = this.store.get(id, ownerId);
    let call = s.calls.find((c) => c.id === callId);
    if (!call) throw missing();
    if (call.endedAt) return;
    if (s.currentCallId !== callId || s.state !== "in_call") throw conflict();
    this.media?.seal(id, callId, ownerId);
    s = this.store.get(id, ownerId);
    call = s.calls.find((c) => c.id === callId);
    call.endedAt = now();
    call.endReason = reason;
    s.busy = false;
    this.launch(s, "recapping", async (token) => {
      const recap = await this.invoke("recap", s, token, call);
      const latest = this.current(token);
      if (!latest) return;
      latest.recaps.push({ ...recap, id: randomUUID(), callId });
      this.store.save(latest);
      this.plan(latest);
    });
    this.media?.callEnded(id, callId, ownerId);
  }
  finish(id, ownerId = defaultWorkspaceId) {
    const s = this.store.get(id, ownerId);
    if (terminal(s.state) || s.state === "reporting") return;
    s.finishRequested = true;
    this.store.save(s);
    if (s.state === "in_call")
      this.closeCall(id, s.currentCallId, "user_finish", ownerId);
    else if (s.state !== "recapping") this.report(s);
  }
  report(s) {
    s.pendingAssignmentId = null;
    s.busy = false;
    this.launch(s, "reporting", async (token) => {
      const report = await this.invoke("report", s, token);
      const latest = this.current(token);
      if (!latest) return;
      latest.report = report;
      latest.state = "completed";
      latest.updatedAt = now();
      latest.version++;
      this.store.save(latest);
    });
  }
  view(id, ownerId = defaultWorkspaceId) {
    const s = this.store.get(id, ownerId);
    const a = s.assignments.find((v) => v.id === s.pendingAssignmentId);
    const persona = (pid) => {
      const p = s.personas.find((v) => v.id === pid);
      return p ? { id: p.id, name: p.name, role: p.role } : null;
    };
    return {
      id: s.id,
      stage: s.stage,
      state: s.state,
      createdAt: s.createdAt,
      plot: publicPlot(s.plot),
      busy: s.busy,
      error: s.error,
      finishRequested: s.finishRequested,
      pendingCall: a
        ? { assignmentId: a.id, persona: persona(a.personaId) }
        : null,
      currentCallId: s.currentCallId,
      atm: {
        balance: Number.isSafeInteger(s.atm?.balance)
          ? s.atm.balance
          : initialAtmBalance,
        transactions: s.messages
          .filter((message) => message.source === "atm")
          .map(
            ({
              id,
              callId,
              action,
              amount,
              recipientLast4,
              balanceAfter,
              createdAt,
            }) => ({
              id,
              callId,
              action,
              amount,
              recipientLast4,
              balanceAfter,
              createdAt,
            }),
          ),
      },
      calls: s.calls.map((c) => ({
        id: c.id,
        ordinal: c.ordinal,
        persona: persona(c.personaId),
        startedAt: c.startedAt,
        endedAt: c.endedAt,
        endReason: c.endReason,
        inputMode: c.inputMode || "text",
        voice: this.store.voice
          .attempts(id, c.id)
          .map(({ id, status, reason, errorCode, elapsedMs, finalized }) => ({
            id,
            status,
            reason,
            errorCode,
            elapsedMs,
            finalized,
          })),
        captions: this.store.voice
          .attempts(id, c.id)
          .flatMap((a) => this.store.voice.fragments(id, a.id)),
        messages: s.messages
          .filter((m) => m.callId === c.id)
          .map(
            ({
              id,
              speaker,
              text,
              createdAt,
              sequence,
              source,
              voiceId,
              fragmentSpans,
              partial,
              playback,
              late,
              action,
              amount,
              recipientLast4,
              balanceAfter,
            }) => ({
              id,
              speaker,
              text,
              createdAt,
              sequence,
              ...(source ? { source } : {}),
              ...(source === "voice"
                ? { voiceId, fragmentSpans, partial, playback, late }
                : {}),
              ...(source === "atm"
                ? { action, amount, recipientLast4, balanceAfter }
                : {}),
            }),
          ),
      })),
      report: s.report,
    };
  }
  list(ownerId = defaultWorkspaceId) {
    return this.store.list(ownerId).map((s) => ({
      id: s.id,
      state: s.state,
      createdAt: s.createdAt,
      plot: publicPlot(s.plot),
    }));
  }
  dispose() {
    this.disposed = true;
    for (const { controller } of this.jobs.values()) controller.abort();
  }
}

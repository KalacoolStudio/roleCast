import { setTimeout as delay } from "node:timers/promises";
import { Store } from "../../packages/storage/src/store.js";
import { Engine } from "../../packages/core/src/engine.js";
export function fixtureAgents(overrides = {}, ms = 0) {
  const calls = [];
  return {
    calls,
    async run(kind, context, signal, prompt) {
      calls.push({ kind, context: structuredClone(context), prompt });
      if (overrides[kind]) return overrides[kind](context, signal);
      if (ms) await delay(ms, undefined, { signal });
      const user = context.messages?.filter((m) => m.speaker === "user").at(-1);
      const evidenceIds = user ? [user.id] : [];
      const finding = { text: "以具體行動支持自己的判斷。", evidenceIds };
      if (kind === "plan") {
        if (
          context.calls.length >= 3 ||
          context.calls.at(-1)?.endReason === "judge"
        )
          return { action: "finish" };
        const assignment = {
          goal: "練習提出清楚的理由。",
          allowedFactIds: context.plot.facts.map((f) => f.id),
          sharedMessageIds: [],
        };
        if (context.calls.length === 1)
          return {
            action: "reuse",
            personaId: context.personas[0].id,
            ...assignment,
          };
        return {
          action: "create",
          persona: {
            id: `persona-${context.calls.length}`,
            name: context.calls.length ? "陳主管" : "林小姐",
            role: context.plot.id === "interview" ? "技術面試官" : "購物客服",
            personality: "冷靜、有禮",
          },
          ...assignment,
        };
      }
      if (kind === "reply")
        return {
          text: context.opening
            ? "你好，我是林小姐。可以和你聊聊這次的情境嗎？"
            : "了解，請再說明你會如何查證與處理。",
          requestHangup: !!user?.text.includes("稍後"),
        };
      if (kind === "watch") {
        const stop =
          !!user?.text.includes("詐騙") && !!user?.text.includes("查證");
        return {
          stop,
          reason: stop ? "明確識破並提出查證" : "尚需更多證據",
          criterionIds: stop ? ["recognition", "verification"] : [],
          evidenceIds,
        };
      }
      if (kind === "recap")
        return {
          endReason: context.endReason,
          events: user ? [finding] : [],
          disclosed: [],
          refused: [],
          strengths: user ? [finding] : [],
          improvements: [],
          uncertainties: user ? [] : ["尚無使用者回答"],
        };
      return {
        summary: user
          ? "你能提出具體行動並清楚表達判斷。"
          : "這次沒有足夠回答可供評估。",
        dimensions: [
          {
            name: "清楚表達",
            assessment: user ? "能提出具體依據。" : "證據不足。",
            evidenceIds,
          },
        ],
        strengths: user ? [finding] : [],
        improvements: [],
        insufficientEvidence: !user,
        uncertainties: user ? [] : ["需要更多對話紀錄"],
      };
    },
  };
}
export function harness(overrides = {}, path = ":memory:", plots) {
  const store = new Store(path);
  const agents = fixtureAgents(overrides);
  const engine = new Engine(store, agents, plots);
  return {
    store,
    agents,
    engine,
    close() {
      engine.dispose();
      store.close();
    },
  };
}
export async function until(fn, timeout = 3000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout)
      throw new Error("Timed out waiting for state");
    await delay(2);
  }
}
export async function ready(h, plot = "anti-fraud") {
  const id = h.engine.start(plot);
  await until(() => h.store.get(id).state === "awaiting_call");
  const callId = h.engine.accept(id, h.store.get(id).pendingAssignmentId);
  await until(() => !h.store.get(id).busy);
  return { id, callId };
}
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

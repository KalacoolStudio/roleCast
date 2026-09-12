import { isTerminal } from "./feed.js";
export const positions = {
  boss: [82, 44],
  report: [64, 49],
  standby: [82, 82],
  entry: [-12, 92],
  foyer: [18, 92],
  waiting: [18, 64],
  office: [22, 78],
  aisle: [49, 71],
  desk: [34, 65],
  watch: [48, 68],
};
export const activityLabels = {
  planning_started: "老闆正在安排下一通",
  persona_assigned: "職員收到指派",
  call_started: "對話已接通",
  turn_started: "正在處理回覆",
  turn_completed: "職員已回覆",
  call_ended: "本通已結束",
  recap_started: "秘書正在整理紀錄",
  recap_completed: "秘書完成回報",
  report_started: "Reporter 正在整理總回饋",
  drill_completed: "演練完成",
  drill_failed: "演練未完成，紀錄已保留",
  drill_interrupted: "演練已中斷，紀錄已保留",
};
const actor = (position, extra = {}) => ({
  position,
  walking: false,
  facing: "right",
  ...extra,
});
export function snapshotScene(drill) {
  const call = drill.calls.find((c) => c.id === drill.currentCallId);
  const previous = drill.calls.at(-1)?.persona;
  const person = drill.pendingCall?.persona || call?.persona || previous;
  const sprite =
    drill.stage?.personas.find((p) => p.id === person?.id)?.spriteKey ||
    "persona-01";
  const visible =
    (drill.state === "awaiting_call" && drill.pendingCall) ||
    drill.state === "in_call" ||
    previous;
  return {
    mastermind: actor("boss", {
      bubble:
        drill.state === "planning" && !drill.finishRequested
          ? "正在安排下一通…"
          : "調度中樞",
    }),
    judge: actor(
      drill.state === "in_call"
        ? "watch"
        : drill.state === "recapping"
          ? "report"
          : "standby",
      {
        bubble:
          drill.state === "in_call"
            ? "監看中"
            : drill.state === "recapping"
              ? "整理本通紀錄…"
              : "待命中",
      },
    ),
    persona:
      visible && person
        ? actor(
            drill.state === "in_call"
              ? "desk"
              : drill.pendingCall
                ? "waiting"
                : "office",
            {
              ...person,
              spriteKey: sprite,
              bubble:
                drill.state === "awaiting_call"
                  ? "等待接通"
                  : drill.state !== "in_call"
                    ? "留在辦公室"
                    : drill.busy
                      ? "正在回覆…"
                      : "通話中",
            },
          )
        : null,
    phase: drill.state,
  };
}
function framesFor(event, scene, snapshot) {
  const frame = (duration, patch) => ({ duration, patch, type: event.type });
  const move = (name, position, extra = {}) => ({
    [name]: { ...scene[name], position, walking: true, ...extra },
  });
  switch (event.type) {
    case "planning_started":
      return [
        frame(350, {
          mastermind: actor("boss", { bubble: "正在安排下一通…" }),
          judge: actor("standby", { walking: true, bubble: "返回待命" }),
          phase: "thinking",
        }),
      ];
    case "persona_assigned": {
      const person = {
        ...event.persona,
        bubble: event.action === "reused" ? "再次上場" : "收到指派",
      };
      return [
        frame(40, {
          persona: actor("entry", person),
          phase: "entering",
          mastermind: actor("boss", { bubble: "已指派下一位職員" }),
        }),
        frame(350, { persona: actor("foyer", { ...person, walking: true }) }),
        frame(450, { persona: actor("waiting", { ...person, walking: true }) }),
      ];
    }
    case "call_started":
      return [
        frame(650, {
          ...snapshotScene(snapshot),
          judge: actor("watch", { walking: true, bubble: "前往監看" }),
          phase: "supervising",
        }),
      ];
    case "call_ended":
      return [
        frame(250, {
          ...move("persona", "aisle", { facing: "left", bubble: "本通結束" }),
          judge: actor("standby", { walking: true, bubble: "整理本通紀錄…" }),
          phase: "leaving",
        }),
        frame(350, {
          ...move("persona", "office", {
            facing: "left",
            bubble: "留在辦公室",
          }),
          judge: actor("report", {
            walking: true,
            facing: "left",
            bubble: "整理本通紀錄…",
          }),
        }),
      ];
    case "recap_started":
      return [
        frame(0, {
          judge: actor("report", { bubble: "整理本通紀錄…" }),
          phase: "recapping",
        }),
      ];
    case "recap_completed":
      return [
        frame(400, {
          judge: actor("report", { bubble: "回報已交付", handoff: true }),
          phase: "handoff",
        }),
      ];
    default:
      return [];
  }
}

// A presentation-only scheduler. All API controls use the separate live snapshot.
export class StageDirector {
  constructor(
    onChange,
    clock = {
      set: (fn, ms) => setTimeout(fn, ms),
      clear: (timer) => clearTimeout(timer),
    },
  ) {
    this.onChange = onChange;
    this.clock = clock;
    this.queue = [];
    this.scene = null;
    this.lastSequence = 0;
  }
  reset(snapshot) {
    this.cancel();
    this.snapshot = snapshot;
    this.lastSequence = snapshot.stage?.lastEventSequence || 0;
    this.scene = snapshotScene(snapshot);
    this.emit(0);
  }
  update(snapshot, events, reduced = false) {
    this.snapshot = snapshot;
    if (!this.scene) this.scene = snapshotScene(snapshot);
    const pending = events.filter(
      (e) => e.sequence > this.lastSequence && e.drillId === snapshot.id,
    );
    for (const e of pending) this.lastSequence = e.sequence;
    if (reduced || isTerminal(snapshot.state) || snapshot.finishRequested) {
      this.cancel();
      this.scene = snapshotScene(snapshot);
      this.emit(0);
      return;
    }
    if (pending.some((e) => e.type === "call_started")) {
      this.cancel();
      this.scene = snapshotScene(snapshot);
    }
    for (const event of pending) {
      if (event.type === "persona_assigned" && snapshot.state === "in_call")
        continue;
      this.queue.push(...framesFor(event, this.scene, snapshot));
    }
    const total = this.queue.reduce((n, f) => n + f.duration, 0);
    if (total > 1700)
      for (const f of this.queue)
        f.duration = Math.round((f.duration * 1700) / total);
    if (!this.timer) this.next();
  }
  next() {
    this.timer = null;
    const frame = this.queue.shift();
    if (!frame) {
      this.scene = snapshotScene(this.snapshot);
      this.emit();
      return;
    }
    this.scene = { ...this.scene, ...frame.patch };
    // Ignore a missing persona (e.g. a connection restored before assignment).
    if (this.scene.persona && !this.scene.persona.id) this.scene.persona = null;
    this.emit(frame.duration);
    this.timer = this.clock.set(() => this.next(), frame.duration);
  }
  emit(moveMs = 600) {
    const output = { ...this.scene };
    for (const kind of ["mastermind", "judge", "persona"]) {
      if (output[kind]) output[kind] = { ...output[kind], moveMs };
    }
    this.onChange(output);
  }
  cancel() {
    this.clock.clear(this.timer);
    this.timer = null;
    this.queue = [];
  }
  dispose() {
    this.cancel();
  }
}

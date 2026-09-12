// Only public presentation data crosses this boundary.
export function stageMetadata(drill, previous = {}) {
  const personas = drill.personas.map((p, i) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    spriteKey:
      previous.personas?.find((v) => v.id === p.id)?.spriteKey ||
      `persona-0${(i % 3) + 1}`,
  }));
  const call = drill.calls.find((c) => c.id === drill.currentCallId);
  const assignment = drill.assignments.find(
    (a) => a.id === (drill.pendingAssignmentId || call?.assignmentId),
  );
  const index = drill.assignments.indexOf(assignment);
  return {
    schemaVersion: 1,
    revision: previous.revision || 0,
    lastEventSequence: previous.lastEventSequence || 0,
    personas,
    currentAssignment: assignment
      ? {
          assignmentId: assignment.id,
          personaId: assignment.personaId,
          action: drill.assignments
            .slice(0, index)
            .some((a) => a.personaId === assignment.personaId)
            ? "reused"
            : "created",
        }
      : null,
  };
}

export function stageEvents(before, after, stage) {
  const events = [];
  const add = (type, data = {}) => events.push({ type, ...data });
  const newItems = (key) =>
    after[key].filter((item) => !before?.[key]?.some((v) => v.id === item.id));
  if (after.state === "planning" && before?.state !== "planning")
    add("planning_started");
  for (const a of newItems("assignments")) {
    add("persona_assigned", {
      assignmentId: a.id,
      persona: stage.personas.find((p) => p.id === a.personaId),
      action: before?.personas.some((p) => p.id === a.personaId)
        ? "reused"
        : "created",
    });
  }
  for (const c of newItems("calls")) {
    add("call_started", {
      callId: c.id,
      assignmentId: c.assignmentId,
      personaId: c.personaId,
    });
    add("turn_started", { callId: c.id });
  }
  for (const m of newItems("messages").filter((m) => m.source !== "voice"))
    add(m.speaker === "user" ? "turn_started" : "turn_completed", {
      callId: m.callId,
      messageId: m.id,
    });
  for (const c of after.calls) {
    if (c.endedAt && !before?.calls.find((v) => v.id === c.id)?.endedAt) {
      add("call_ended", {
        callId: c.id,
        personaId: c.personaId,
        endReason: c.endReason,
      });
    }
  }
  if (after.state === "recapping" && before?.state !== "recapping")
    add("recap_started", { callId: after.currentCallId });
  for (const r of newItems("recaps"))
    add("recap_completed", { callId: r.callId });
  const states = {
    reporting: "report_started",
    completed: "drill_completed",
    failed: "drill_failed",
    interrupted: "drill_interrupted",
  };
  if (states[after.state] && before?.state !== after.state)
    add(states[after.state]);
  return events;
}

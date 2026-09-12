import { expect, it } from "vitest";
import { conversationRows } from "../apps/web/src/conversation.jsx";
it("grows captions without duplicates while preserving overlap, late sources and exact evidence anchors", () => {
  const a = {
    id: "a",
    voiceId: "v",
    callId: "c",
    speaker: "user",
    sequence: 1,
    delta: "第一",
  };
  const b = { ...a, id: "b", sequence: 2, delta: "句。" };
  const c = {
    ...a,
    id: "c",
    speaker: "persona",
    sequence: 3,
    delta: "同時說話",
  };
  const d = { ...a, id: "d", sequence: 4, delta: "晚到", late: true };
  const evidence = {
    id: "e",
    sequence: 2,
    source: "voice",
    voiceId: "v",
    text: "第一句。",
    fragmentSpans: [
      { id: "a", start: 0, end: 2 },
      { id: "b", start: 0, end: 2 },
    ],
  };
  const call = {
    id: "c",
    messages: [{ id: "typed", sequence: 1, text: "文字開場" }],
    captions: [a],
  };
  const before = conversationRows(call),
    events = [b, c, d].map((fragment) => ({
      callId: "c",
      type: "caption",
      fragment,
    }));
  events.push({ callId: "c", type: "checkpoint", messages: [evidence] });
  const live = conversationRows(call, events);
  expect(live.map((r) => r.text)).toEqual([
    "文字開場",
    "第一句。",
    "同時說話",
    "晚到",
  ]);
  expect(live[1].id).toBe(before[1].id);
  expect(live[1].anchors[0]).toEqual(evidence);
  call.captions.push(b, c, d);
  call.messages.push(evidence);
  expect(conversationRows(call, events)).toEqual(live);
  expect(conversationRows(call)).toEqual(live);
});

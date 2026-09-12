import { z } from "zod";

export const terminal = (state) =>
  ["completed", "failed", "interrupted"].includes(state);
export class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export const conflict = () =>
  new AppError("CONFLICT", "狀態已變更，請重新取得演練狀態。", 409);
export const missing = () =>
  new AppError("NOT_FOUND", "找不到指定的演練或通話。", 404);
const text = z.string().trim().min(1).max(12000);
const ids = z.array(z.string().min(1)).max(100);
export const personaSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: text,
    role: text,
    personality: text,
  })
  .strict();
const assignment = { goal: text, sharedMessageIds: ids };
export const planSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      persona: personaSchema,
      ...assignment,
    })
    .strict(),
  z
    .object({
      action: z.literal("reuse"),
      personaId: z.string().min(1),
      ...assignment,
    })
    .strict(),
  z.object({ action: z.literal("finish") }).strict(),
]);
export const replySchema = z
  .object({ text, requestHangup: z.boolean() })
  .strict();
export const watchSchema = z
  .object({
    stop: z.boolean(),
    reason: text,
    evidenceIds: ids,
  })
  .strict();
const finding = z.object({ text, evidenceIds: ids }).strict();
export const recapSchema = z
  .object({
    endReason: text,
    events: z.array(finding),
    disclosed: z.array(finding),
    refused: z.array(finding),
    strengths: z.array(finding),
    improvements: z.array(finding),
    uncertainties: z.array(text),
  })
  .strict();
export const reportSchema = z
  .object({
    summary: text,
    dimensions: z
      .array(
        z.object({ name: text, assessment: text, evidenceIds: ids }).strict(),
      )
      .min(1),
    strengths: z.array(finding),
    improvements: z.array(finding),
    insufficientEvidence: z.boolean(),
    uncertainties: z.array(text),
  })
  .strict();
export const schemas = {
  voiceAssist: z
    .object({ context: z.string().max(2000), requestHangup: z.boolean() })
    .strict(),
  plan: planSchema,
  reply: replySchema,
  watch: watchSchema,
  recap: recapSchema,
  report: reportSchema,
};

export function inputText(value, limit, optional = false) {
  if (
    typeof value !== "string" ||
    [...value].length > limit ||
    (!optional && !value.trim())
  )
    throw new AppError(
      "INVALID_INPUT",
      `文字需${optional ? "不超過" : "非空白且不超過"} ${limit} 字。`,
    );
  return value.trim();
}
export function validateReferences(value, validIds) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((v) => validateReferences(v, validIds));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === "evidenceIds" && entry.some((id) => !validIds.has(id)))
      throw new Error("Invalid evidence reference");
    if (key !== "evidenceIds") validateReferences(entry, validIds);
  }
}
export function validateResult(kind, value, context) {
  const result = schemas[kind].parse(value);
  const messages = context.messages || [];
  const validEvidence = messages.filter(
    (message) => kind !== "report" || message.speaker === "user",
  );
  validateReferences(result, new Set(validEvidence.map((m) => m.id)));
  if (kind === "plan" && result.action !== "finish") {
    const sourceIds = new Set(
      messages.filter((m) => m.speaker === "user").map((m) => m.id),
    );
    if (result.sharedMessageIds.some((id) => !sourceIds.has(id)))
      throw new Error("Unknown source message");
    if (
      result.action === "reuse" &&
      !context.personas.some((p) => p.id === result.personaId)
    )
      throw new Error("Unknown persona");
    if (
      result.action === "create" &&
      context.personas.some((p) => p.id === result.persona.id)
    )
      throw new Error("Persona identity already exists");
  }
  if (kind === "watch" && result.stop && !result.evidenceIds.length)
    throw new Error("Stop decision requires valid evidence");
  if (kind === "recap" && result.endReason !== context.endReason)
    throw new Error("Wrong end reason");
  if (
    kind === "report" &&
    !messages.some((m) => m.speaker === "user") &&
    !result.insufficientEvidence
  )
    throw new Error("No participant evidence");
  return result;
}

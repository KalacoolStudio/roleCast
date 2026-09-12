import { z } from "zod";
import { AppError } from "./contracts.js";

const text = (max) => z.string().trim().min(1).max(max);
const identifier = text(100);
const legacyFacts = z.array(
  z.object({ id: identifier, key: text(120), value: text(2000) }).strict(),
);
const legacyCriteria = z.array(
  z.object({ id: identifier, description: text(2000) }).strict(),
);
export const defaultMastermindPrompt =
  "從虛構購物客服來電開始，按受測者反應安排後續角色或回撥，練習異常要求識別與獨立查證。所有資金操作僅口頭模擬。";
export const defaultJudgePrompt =
  "聚焦異常識別、敏感資訊保護與獨立查證。簡短拒絕不等於識破，明確質疑詐騙且提出獨立查證才能依停止條件中斷。";
export const plotDefinitionSchema = z
  .object({
    name: text(120),
    category: text(60),
    description: text(1000),
    duration: text(80),
    goal: text(6000),
    stopCondition: text(4000),
    maxCalls: z.number().int().min(1).max(3),
    maxUserTurnsPerCall: z.number().int().min(1).max(12),
    maxVoiceSecondsPerCall: z.number().int().min(1).max(600).default(600),
    prompts: z
      .object({
        mastermind: text(12000),
        judge: text(12000),
        reporter: text(12000),
      })
      .strict(),
  })
  .strict();
export const plotSchema = plotDefinitionSchema.extend({
  id: identifier,
  version: z.number().int().positive(),
});
const portableSchema = z
  .object({ formatVersion: z.literal(2), plot: plotDefinitionSchema })
  .strict();
const legacyPortableSchema = z
  .object({
    formatVersion: z.literal(1),
    plot: plotDefinitionSchema.extend({
      facts: legacyFacts.max(30),
      criteria: legacyCriteria.min(1).max(30),
    }),
  })
  .strict();
export function parsePlot(value, schema = plotDefinitionSchema) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const paths = [
      ...new Set(result.error.issues.map((i) => i.path.join(".") || "plot")),
    ];
    throw new AppError(
      "INVALID_PLOT",
      `劇本欄位無效，請檢查：${paths.join("、")}。請確認必填、長度與數量上限。`,
    );
  }
  return result.data;
}
export function plotDefinition(plot) {
  const { id: _id, version: _version, ...definition } = plot;
  return parsePlot(definition);
}
export function exportPlot(plot) {
  return JSON.stringify(
    { formatVersion: 2, plot: plotDefinition(plot) },
    null,
    2,
  );
}
export function importPlot(source) {
  if (new TextEncoder().encode(source).length > 262144)
    throw new AppError("INVALID_PLOT", "劇本檔案不可超過 256 KB。");
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    throw new AppError("INVALID_PLOT", "無法解析 JSON，請檢查檔案格式。");
  }
  if (value?.formatVersion === 1) {
    const legacy = parsePlot(value, legacyPortableSchema).plot;
    const { facts: _facts, criteria: _criteria, ...definition } = legacy;
    return parsePlot(definition);
  }
  return parsePlot(value, portableSchema).plot;
}
export const publicPlot = ({
  id,
  version,
  name,
  category,
  description,
  duration,
  maxVoiceSecondsPerCall = 600,
}) => ({
  id,
  version,
  name,
  category,
  description,
  duration,
  maxVoiceSecondsPerCall,
});
export const blankPlot = () => ({
  name: "",
  category: "自訂練習",
  description: "",
  duration: "約 5–10 分鐘",
  goal: "",
  stopCondition: "",
  maxCalls: 3,
  maxUserTurnsPerCall: 12,
  maxVoiceSecondsPerCall: 600,
  prompts: {
    mastermind: defaultMastermindPrompt,
    judge: defaultJudgePrompt,
    reporter: "依據逐字稿與通話回顧，提供具體、有引用依據的改進建議。",
  },
});

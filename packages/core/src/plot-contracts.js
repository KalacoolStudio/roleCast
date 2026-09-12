import { z } from "zod";
import { AppError } from "./contracts.js";

const text = (max) => z.string().trim().min(1).max(max);
const identifier = text(100);
export const plotDefinitionSchema = z
  .object({
    name: text(120),
    category: text(60),
    description: text(1000),
    duration: text(80),
    goal: text(6000),
    facts: z
      .array(
        z
          .object({ id: identifier, key: text(120), value: text(2000) })
          .strict(),
      )
      .max(30),
    criteria: z
      .array(z.object({ id: identifier, description: text(2000) }).strict())
      .min(1)
      .max(30),
    stopCondition: text(4000),
    maxCalls: z.number().int().min(1).max(3),
    maxUserTurnsPerCall: z.number().int().min(1).max(12),
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
  .object({ formatVersion: z.literal(1), plot: plotDefinitionSchema })
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
  const plot = result.data.plot || result.data;
  for (const [items, field, label] of [
    [plot.facts, "id", "facts.id"],
    [plot.facts, "key", "facts.key"],
    [plot.criteria, "id", "criteria.id"],
  ]) {
    if (new Set(items.map((item) => item[field])).size !== items.length)
      throw new AppError("INVALID_PLOT", `劇本的 ${label} 不可重複。`);
  }
  return result.data;
}
export function plotDefinition(plot) {
  const { id: _id, version: _version, ...definition } = plot;
  return parsePlot(definition);
}
export function exportPlot(plot) {
  return JSON.stringify(
    { formatVersion: 1, plot: plotDefinition(plot) },
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
  return parsePlot(value, portableSchema).plot;
}
export const publicPlot = ({
  id,
  version,
  name,
  category,
  description,
  duration,
}) => ({ id, version, name, category, description, duration });
export const blankPlot = () => ({
  name: "",
  category: "自訂練習",
  description: "",
  duration: "約 5–10 分鐘",
  goal: "",
  facts: [],
  criteria: [{ id: "criterion-1", description: "" }],
  stopCondition: "",
  maxCalls: 3,
  maxUserTurnsPerCall: 12,
  prompts: {
    mastermind: "依演練目標安排角色及對話任務，根據每通回顧調整難度。",
    judge: "以劇本判準客觀評估具體回答，區分已展現能力與證據不足。",
    reporter: "依據逐字稿與通話回顧，提供具體、有引用依據的改進建議。",
  },
});

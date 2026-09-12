import { readFileSync } from "node:fs";
import { z } from "zod";
import { factSchema } from "./contracts.js";
export const scenarioSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  name: z.string(),
  category: z.string(),
  description: z.string(),
  duration: z.string(),
  goal: z.string(),
  facts: z.array(factSchema),
  criteria: z.array(z.object({ id: z.string(), description: z.string() })),
  stopCondition: z.string(),
  maxCalls: z.number().int().min(1).max(3),
  maxUserTurnsPerCall: z.number().int().min(1).max(12),
});
export const scenarios = ["anti-fraud", "interview"].map((id) =>
  scenarioSchema.parse(
    JSON.parse(
      readFileSync(new URL(`./scenarios/${id}.json`, import.meta.url), "utf8"),
    ),
  ),
);
export const publicScenario = ({
  id,
  name,
  category,
  description,
  duration,
}) => ({ id, name, category, description, duration });

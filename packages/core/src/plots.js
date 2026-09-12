import { readFileSync } from "node:fs";
import { parsePlot, plotSchema } from "./plot-contracts.js";
export const builtInPlots = ["anti-fraud", "interview"].map((id) =>
  parsePlot(
    JSON.parse(
      readFileSync(new URL(`./plots/${id}.json`, import.meta.url), "utf8"),
    ),
    plotSchema,
  ),
);

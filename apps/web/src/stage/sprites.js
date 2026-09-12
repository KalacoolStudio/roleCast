const feet = {
  mastermind: [492, 492, 492, 492, 461, 470, 464, 469],
  judge: [507, 507, 507, 507, 466, 468, 469, 467],
  "persona-01": [490, 490, 490, 490, 466, 467, 466, 467],
  "persona-02": [500, 500, 500, 500, 477, 479, 477, 480],
  "persona-03": [498, 498, 498, 498, 475, 474, 474, 477],
};
const source = "/assets/characters/warm/";
// Original 384x512 cells. Offsets align the lowest foot within each walk frame.
export const sprites = Object.fromEntries(
  ["mastermind", "judge", "persona-01", "persona-02", "persona-03"].map(
    (key) => [
      key,
      {
        src: `${source}${key}.png`,
        width: 1536,
        height: 1024,
        columns: 4,
        rows: 2,
        idle: [0],
        walk: [4, 5, 6, 7],
        frameMs: 120,
        footOffsets: feet[key].map((y) => ((490 - y) / 512) * 100),
        // Brighten only the rendered sprite; multiply blends its pale paper into the stage.
        brightness: key === "persona-01" ? 1.1 : 1.02,
      },
    ],
  ),
);

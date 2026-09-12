const feet = {
  mastermind: [480, 480, 480, 480, 480, 480, 480, 480],
  judge: [481, 481, 481, 481, 481, 481, 481, 481],
  "persona-01": [481, 481, 481, 481, 481, 480, 480, 480],
  "persona-02": [481, 481, 481, 481, 481, 481, 481, 481],
  "persona-03": [481, 481, 481, 481, 480, 481, 481, 481],
};
const source = "/assets/characters/warm/";
// Transparent 384x512 cells. Offsets align the lowest foot within each walk frame.
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
        frameMs: 90,
        footOffsets: feet[key].map((y) => ((481 - y) / 512) * 100),
      },
    ],
  ),
);

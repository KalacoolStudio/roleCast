import { copyFileSync, mkdirSync, constants } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
export function prepare(directory) {
  try {
    copyFileSync(
      resolve(directory, ".env.example"),
      resolve(directory, ".env"),
      constants.COPYFILE_EXCL,
    );
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  mkdirSync(resolve(directory, "data"), { recursive: true });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const install = spawnSync("npm", ["ci", "--no-audit", "--no-fund"], {
    cwd: root,
    stdio: "inherit",
  });
  if (install.status !== 0) process.exit(install.status || 1);
  prepare(root);
  console.log(
    "依賴已就緒。請在 .env 填入 LLM_API_KEY、LLM_BASE_URL、LLM_MODEL，再執行 just dev。",
  );
}

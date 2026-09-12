import { randomUUID } from "node:crypto";
import { writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { root } from "../../apps/server/src/config.js";
const image = process.argv[2];
if (!image || image.startsWith("-")) throw new Error("Supply an image tag");
const sentinel = `rolecast-build-sentinel-${randomUUID()}`;
const path = new URL("../../apps/server/.env.build-sentinel", import.meta.url);
writeFileSync(path, `LLM_API_KEY=${sentinel}\n`, { flag: "wx", mode: 0o600 });
const docker = (args, options = {}) => {
  const result = spawnSync("docker", args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error("Container build verification failed");
};
try {
  docker(["build", "--network=host", "--tag", image, "."]);
  // Check the resulting filesystem. The final stage does not delete copied application files.
  docker(
    [
      "run",
      "-i",
      "--rm",
      "--network",
      "none",
      "--entrypoint",
      "node",
      image,
      "--input-type=module",
      "-e",
      `
    import {readdirSync,readFileSync,lstatSync} from 'node:fs';
    const sentinel=readFileSync(0,'utf8');
    function inspect(dir){for(const entry of readdirSync(dir)){const path=dir+'/'+entry;const st=lstatSync(path);if(st.isSymbolicLink())continue;if(st.isDirectory())inspect(path);else if(readFileSync(path).includes(sentinel))throw new Error('Build context secret leaked');}}
    inspect('/app');
    for(const path of ['/app/.env','/app/.git','/app/data','/app/apps/server/.env.build-sentinel']){try{lstatSync(path)}catch(e){if(e.code==='ENOENT')continue;throw e}throw new Error('Local file included in image');}
  `,
    ],
    { input: sentinel, stdio: ["pipe", "inherit", "inherit"] },
  );
  console.log("Image built; local env/data exclusions verified.");
} finally {
  rmSync(path, { force: true });
}

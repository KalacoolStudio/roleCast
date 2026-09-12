import { expect, it } from "vitest";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { until } from "./support/fixtures.js";
const moduleURL = new URL("../scripts/supervisor.js", import.meta.url).href;
async function exercise(fail) {
  const program = `import {supervise} from ${JSON.stringify(moduleURL)};const {children}=supervise([{command:process.execPath,args:['-e','setInterval(()=>{},1000)']},{command:process.execPath,args:['-e',${JSON.stringify(fail ? "setTimeout(()=>process.exit(7),300)" : "setInterval(()=>{},1000)")}]}]);console.log(JSON.stringify(children.map(c=>c.pid)));`;
  const child = spawn(
    process.execPath,
    ["--input-type=module", "-e", program],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  const ended = once(child, "exit");
  await until(() => output.includes("\n"));
  const pids = JSON.parse(output.trim());
  if (!fail) child.kill("SIGINT");
  const [code] = await ended;
  expect(code).toBe(fail ? 7 : 0);
  for (const pid of pids) expect(() => process.kill(pid, 0)).toThrow();
}
it("Ctrl-C stops both child processes", () => exercise(false));
it("a child failure stops the sibling and preserves the error exit code", () =>
  exercise(true));

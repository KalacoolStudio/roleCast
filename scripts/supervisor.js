import { spawn } from "node:child_process";
export function supervise(commands) {
  const children = commands.map(({ command, args, options }) =>
    spawn(command, args, {
      stdio: "inherit",
      detached: process.platform !== "win32",
      ...options,
    }),
  );
  let stopping = false,
    remaining = children.length,
    timer;
  function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    for (const child of children) {
      try {
        if (process.platform !== "win32" && child.pid)
          process.kill(-child.pid, "SIGTERM");
        else child.kill("SIGTERM");
      } catch {
        /* already exited */
      }
    }
    timer = setTimeout(() => {
      for (const child of children) {
        try {
          if (process.platform !== "win32" && child.pid)
            process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {
          /* exited */
        }
      }
    }, 4000);
    timer.unref();
  }
  process.on("SIGINT", () => stop(0));
  process.on("SIGTERM", () => stop(0));
  for (const child of children) {
    child.once("error", () => stop(1));
    child.once("exit", (code) => {
      remaining--;
      if (!stopping) stop(code || 1);
      if (!remaining) clearTimeout(timer);
    });
  }
  return { children, stop };
}

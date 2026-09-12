import { afterEach, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, spawn } from "node:child_process";
import { once } from "node:events";

const roots = [];
afterEach(() =>
  roots.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })),
);
const repo = "asia-east1-docker.pkg.dev/rolecast-example/rolecast/rolecast";
const oldCommit = "a".repeat(40),
  commit = "b".repeat(40),
  oldImage = repo + "@sha256:" + "a".repeat(64),
  image = repo + "@sha256:" + "b".repeat(64);
const oldId = `1-${oldCommit}-111111111111`;
const adapters = readFileSync(
  new URL("./support/host-adapters.sh", import.meta.url),
  "utf8",
);
function fixture({ existing = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "rolecast-host-"));
  roots.push(root);
  const data = join(root, "data"),
    state = join(data, "state"),
    run = join(root, "run");
  for (const path of [
    state,
    run,
    join(data, "app"),
    join(data, "backups"),
    join(state, "releases"),
  ])
    mkdirSync(path, { recursive: true });
  writeFileSync(join(root, "config.json"), "{}");
  writeFileSync(join(data, "app/role-cast.sqlite"), "PERSISTENT_RECORDS");
  writeFileSync(join(root, "calls"), "");
  if (existing) {
    const release = join(state, "releases", oldId);
    mkdirSync(release);
    for (const [name, value] of Object.entries({
      image: oldImage,
      commit: oldCommit,
      generation: "1",
      "config.json": "{}",
    }))
      writeFileSync(
        join(release, name),
        value + (name === "config.json" ? "" : "\n"),
      );
    for (const file of ["current", "active"])
      writeFileSync(join(state, file), oldId + "\n");
    writeFileSync(join(run, "writer"), oldId);
  }
  const env = {
    ...process.env,
    SCRIPT: resolve("scripts/gcp/host.sh"),
    ROLECAST_ROOT: root,
    ROLECAST_DATA: data,
    ROLECAST_RUN: run,
    IMAGE_REPOSITORY: repo,
    BACKUP_BUCKET: "test-backups",
    DATA_DEVICE: "/dev/fake-managed-disk",
    INITIALIZE_DATA_DISK: "false",
    CALLS: join(root, "calls"),
    OLD_ID: oldId,
    IMAGE: image,
    COMMIT: commit,
    GENERATION: "2",
  };
  const command = (code, extra = {}) => {
    const result = spawnSync("bash", ["-c", adapters + "\n" + code], {
      env: { ...env, ...extra },
      encoding: "utf8",
      // Leave room for cold process/filesystem startup on shared CI runners,
      // while staying within Vitest's 10-second test budget.
      timeout: 8000,
    });
    if (result.error) throw result.error;
    return result;
  };
  return {
    root,
    data,
    state,
    run,
    env,
    command,
    read: (name) => readFileSync(join(state, name), "utf8").trim(),
    calls: () => readFileSync(join(root, "calls"), "utf8"),
  };
}
it("replaces a release only after stopping its writer and backing up; preserves data", () => {
  const h = fixture(),
    r = h.command('deploy "$IMAGE" "$COMMIT" "$GENERATION"');
  expect(r.status, r.stderr).toBe(0);
  const current = h.read("current");
  expect(current).not.toBe(oldId);
  expect(h.read("active")).toBe(current);
  expect(h.read("previous")).toBe(oldId);
  expect(h.calls().indexOf("systemctl stop")).toBeLessThan(
    h.calls().indexOf("database.js backup"),
  );
  expect(h.calls().indexOf("database.js backup")).toBeLessThan(
    h.calls().indexOf("systemctl start"),
  );
  expect(readFileSync(join(h.data, "app/role-cast.sqlite"), "utf8")).toBe(
    "PERSISTENT_RECORDS",
  );
  expect(existsSync(join(h.state, "transaction"))).toBe(false);
});
it.each(["FAIL_PULL", "FAIL_SECRET", "FAIL_MOUNT"])(
  "%s leaves the running release intact",
  (flag) => {
    const h = fixture(),
      r = h.command('deploy "$IMAGE" "$COMMIT" "$GENERATION"', { [flag]: "1" });
    expect(r.status).not.toBe(0);
    expect(h.read("current")).toBe(oldId);
    expect(h.calls()).not.toContain("systemctl stop");
    expect(existsSync(join(h.run, "writer"))).toBe(true);
  },
);
it.each(["FAIL_BACKUP", "FAIL_UPLOAD", "FAIL_HEALTH"])(
  "%s recovers the prior image and still fails deployment",
  (flag) => {
    const h = fixture(),
      r = h.command('deploy "$IMAGE" "$COMMIT" "$GENERATION"', { [flag]: "1" });
    expect(r.status).not.toBe(0);
    expect(h.read("current")).toBe(oldId);
    expect(h.read("active")).toBe(oldId);
    expect(h.read("result")).toBe("ROLECAST_RESULT=rolled-back");
    expect(readFileSync(join(h.data, "app/role-cast.sqlite"), "utf8")).toBe(
      "PERSISTENT_RECORDS",
    );
  },
);
it("does not start another writer after stop failure", () => {
  const h = fixture(),
    r = h.command('deploy "$IMAGE" "$COMMIT" "$GENERATION"', {
      FAIL_STOP: "1",
    });
  expect(r.status).not.toBe(0);
  expect(h.calls()).not.toContain("systemctl start");
});
it("retains the last successful backup timestamp when a later upload fails", () => {
  const h = fixture();
  expect(h.command('backup "$OLD_ID" scheduled').status).toBe(0);
  const success = h.read("backup-last-success");
  expect(success).toContain(" OK gs://");
  expect(
    h.command('backup "$OLD_ID" scheduled', { FAIL_UPLOAD: "1" }).status,
  ).not.toBe(0);
  expect(h.read("backup-status")).toContain(" FAILED ");
  expect(h.read("backup-last-success")).toBe(success);
});
it.each(["FAIL_COMPAT", "FAIL_ROLLBACK_HEALTH"])(
  "failed recovery (%s) preserves data and transaction evidence",
  (flag) => {
    const h = fixture(),
      r = h.command('deploy "$IMAGE" "$COMMIT" "$GENERATION"', {
        FAIL_HEALTH: "1",
        [flag]: "1",
      });
    expect(r.status).not.toBe(0);
    expect(existsSync(join(h.state, "transaction"))).toBe(true);
    expect(existsSync(join(h.run, "writer"))).toBe(false);
    expect(readFileSync(join(h.data, "app/role-cast.sqlite"), "utf8")).toBe(
      "PERSISTENT_RECORDS",
    );
  },
);
it("reports a failed first deployment without pretending to roll back", () => {
  const h = fixture({ existing: false }),
    r = h.command('deploy "$IMAGE" "$COMMIT" "$GENERATION"', {
      FAIL_HEALTH: "1",
    });
  expect(r.status).not.toBe(0);
  expect(h.read("result")).toBe("ROLECAST_RESULT=failed-first-release");
  expect(existsSync(join(h.state, "current"))).toBe(false);
});
it("skips stale and already-current requests", () => {
  const h = fixture();
  writeFileSync(join(h.state, "releases", oldId, "generation"), "3\n");
  expect(h.command('deploy "$IMAGE" "$COMMIT" "$GENERATION"').status).toBe(0);
  expect(h.read("result")).toBe("ROLECAST_RESULT=skipped-stale");
  expect(h.calls()).toBe("");
  const r = h.command('deploy "$IMAGE" "$COMMIT" "$GENERATION"', {
    IMAGE: oldImage,
    COMMIT: oldCommit,
    GENERATION: "3",
  });
  expect(r.status).toBe(0);
  expect(h.read("result")).toBe("ROLECAST_RESULT=already-current");
  expect(h.read("generation-watermark")).toBe("3");
  // A manual rollback must not allow an older queued workflow to replace it.
  writeFileSync(join(h.state, "releases", oldId, "generation"), "1\n");
  expect(h.command('deploy "$IMAGE" "$COMMIT" "$GENERATION"').status).toBe(0);
  expect(h.read("result")).toBe("ROLECAST_RESULT=skipped-stale");
});
it("serializes concurrent replacement requests using a real host lock", async () => {
  const h = fixture();
  const run = (extra) => {
    const child = spawn(
      "bash",
      ["-c", adapters + '\ndeploy "$IMAGE" "$COMMIT" "$GENERATION"'],
      { env: { ...h.env, SLOW_HEALTH: "1", ...extra }, stdio: "ignore" },
    );
    return once(child, "exit");
  };
  const outcomes = await Promise.all([
    run({}),
    run({
      GENERATION: "3",
      COMMIT: "c".repeat(40),
      IMAGE: repo + "@sha256:" + "c".repeat(64),
    }),
  ]);
  expect(outcomes.every(([code]) => code === 0)).toBe(true);
  expect(
    readFileSync(
      join(h.state, "releases", h.read("current"), "generation"),
      "utf8",
    ).trim(),
  ).toBe("3");
});
it("recovers an interrupted image transaction on reboot but refuses interrupted data restoration", () => {
  const h = fixture();
  writeFileSync(join(h.state, "transaction"), "candidate");
  expect(h.command("boot_recovery").status).toBe(0);
  expect(h.read("active")).toBe(oldId);
  writeFileSync(join(h.state, "transaction"), "restore-" + oldId);
  const r = h.command("boot_recovery");
  expect(r.status).not.toBe(0);
  expect(r.stderr).toContain("operator review");
});
it("initializes only an explicitly permitted blank disk and preserves existing filesystems", () => {
  const h = fixture();
  expect(h.command("prepare", { EMPTY_DISK: "1" }).status).not.toBe(0);
  expect(
    h.command("prepare", {
      EMPTY_DISK: "1",
      INITIALIZE_DATA_DISK: "true",
      DEVICE_SIGNATURE: "xfs",
    }).status,
  ).not.toBe(0);
  expect(existsSync(join(h.run, "formatted"))).toBe(false);
  expect(
    h.command("prepare", { EMPTY_DISK: "1", INITIALIZE_DATA_DISK: "true" })
      .status,
  ).toBe(0);
  expect(h.command("prepare").status).toBe(0);
  expect(readFileSync(join(h.run, "formatted"), "utf8")).toBe("formatted\n");
  rmSync(join(h.run, "formatted"));
  expect(
    h.command("prepare", { EMPTY_DISK: "1", INITIALIZE_DATA_DISK: "true" })
      .status,
  ).not.toBe(0);
  expect(existsSync(join(h.run, "formatted"))).toBe(false);
  expect(h.command("prepare", { FS_LABEL: "other-data" }).status).not.toBe(0);
  expect(h.command("prepare", { FAIL_DEVICE: "1" }).status).not.toBe(0);
});
it("restores only a verified staged backup and retains the old SQLite sidecars", () => {
  const h = fixture();
  writeFileSync(join(h.data, "backups/selected.sqlite"), "RESTORED_RECORDS");
  for (const suffix of ["-wal", "-shm"])
    writeFileSync(
      join(h.data, "app/role-cast.sqlite" + suffix),
      "PRESERVE" + suffix,
    );
  expect(
    h.command('restore selected.sqlite "$OLD_ID"', { FAIL_VERIFY: "1" }).status,
  ).not.toBe(0);
  expect(h.calls()).not.toContain("systemctl stop");
  const r = h.command('restore selected.sqlite "$OLD_ID"');
  expect(r.status, r.stderr).toBe(0);
  expect(readFileSync(join(h.data, "app/role-cast.sqlite"), "utf8")).toBe(
    "RESTORED_RECORDS",
  );
  const saved = readdirSync(h.state).find((name) =>
    name.startsWith("pre-restore-"),
  );
  expect(readFileSync(join(h.state, saved, "role-cast.sqlite"), "utf8")).toBe(
    "PERSISTENT_RECORDS",
  );
  expect(existsSync(join(h.state, saved, "role-cast.sqlite-wal"))).toBe(true);
  expect(existsSync(join(h.state, saved, "role-cast.sqlite-shm"))).toBe(true);
});
it("an interrupted restore cannot silently start an empty replacement database", () => {
  const h = fixture();
  writeFileSync(join(h.data, "backups/selected.sqlite"), "RESTORED_RECORDS");
  expect(
    h.command('restore selected.sqlite "$OLD_ID"', { FAIL_INSTALL: "1" })
      .status,
  ).not.toBe(0);
  expect(h.command("boot_recovery").status).not.toBe(0);
  const saved = readdirSync(h.state).find((name) =>
    name.startsWith("pre-restore-"),
  );
  expect(readFileSync(join(h.state, saved, "role-cast.sqlite"), "utf8")).toBe(
    "PERSISTENT_RECORDS",
  );
});

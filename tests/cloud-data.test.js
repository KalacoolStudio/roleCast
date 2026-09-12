import { afterEach, expect, it } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { parse } from "dotenv";
import { loadConfig } from "../apps/server/src/config.js";
import {
  backupDatabase,
  assertCompatible,
  verifyBackup,
  supportedSchema,
} from "../scripts/gcp/database.js";
import { runtimeEnvironment, uploadFile } from "../scripts/gcp/cloud.js";
import { harness, ready } from "./support/fixtures.js";

const cleanup = [];
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach((fn) => fn()),
);
function directory() {
  const path = mkdtempSync(join(tmpdir(), "rolecast-cloud-"));
  cleanup.push(() => rmSync(path, { recursive: true, force: true }));
  return path;
}
it("backs up committed WAL data without interrupting the active exercise", async () => {
  const dir = directory(),
    source = join(dir, "live.sqlite"),
    target = join(dir, "backup.sqlite");
  const h = harness({}, source);
  cleanup.push(() => h.close());
  h.store.db.pragma("wal_autocheckpoint = 0");
  const { id } = await ready(h);
  const before = h.store.get(id);
  const manifest = await backupDatabase(source, target, {
    commit: "fixture",
    image: "fixture-image",
  });
  expect(manifest.schema).toBe(4);
  expect(h.store.get(id)).toEqual(before);
  const backup = new Database(target, { readonly: true });
  expect(
    JSON.parse(
      backup.prepare("SELECT payload FROM sessions WHERE id=?").get(id).payload,
    ).state,
  ).toBe("in_call");
  backup.close();
  expect(verifyBackup(target)).toEqual(manifest);
  await expect(backupDatabase(source, target)).rejects.toThrow();
  writeFileSync(target, "corrupt");
  expect(() => verifyBackup(target)).toThrow("checksum");
});
it("refuses a newer database schema without migrating or recovering records", () => {
  const path = join(directory(), "new.sqlite");
  const db = new Database(path);
  db.pragma(`user_version = ${supportedSchema + 1}`);
  db.close();
  expect(() => assertCompatible(path)).toThrow("not supported");
  const check = new Database(path, { readonly: true });
  expect(check.pragma("user_version", { simple: true })).toBe(
    supportedSchema + 1,
  );
  check.close();
});
const secretVersions = Object.fromEntries(
  ["LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL"].map((name) => [
    name,
    `projects/test-project/secrets/${name}/versions/1`,
  ]),
);
const secretValues = {
  LLM_API_KEY: "SENTINEL_SECRET",
  LLM_BASE_URL: "https://provider.invalid/v1",
  LLM_MODEL: "fixture",
};
const reply = (data) =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
function secretFetcher(deny = false) {
  return async (url, options) => {
    if (url.startsWith("http://metadata.google.internal/")) {
      expect(options.headers["Metadata-Flavor"]).toBe("Google");
      return reply({ access_token: "SENTINEL_TOKEN" });
    }
    expect(options.headers.Authorization).toBe("Bearer SENTINEL_TOKEN");
    if (deny) return new Response("SECRET_ERROR_BODY", { status: 403 });
    const key = url.match(/\/secrets\/([^/]+)/)[1];
    return reply({
      payload: { data: Buffer.from(secretValues[key]).toString("base64") },
    });
  };
}
it("fetches pinned secrets into a private env file and preserves it on failed refresh", async () => {
  const path = join(directory(), "runtime.env");
  await runtimeEnvironment({ secretVersions }, path, secretFetcher());
  const contents = readFileSync(path, "utf8");
  const config = loadConfig("/nonexistent", parse(contents));
  expect(config.apiKey).toBe("SENTINEL_SECRET");
  expect(config.live.available).toBe(true);
  expect(contents).toContain("DATABASE_PATH=/data/role-cast.sqlite");
  expect(statSync(path).mode & 0o777).toBe(0o600);
  await expect(
    runtimeEnvironment({ secretVersions }, path, secretFetcher(true)),
  ).rejects.toThrow("403");
  expect(readFileSync(path, "utf8")).toBe(contents);
  await expect(
    runtimeEnvironment(
      {
        secretVersions: {
          ...secretVersions,
          LLM_API_KEY: "projects/p/secrets/k/versions/latest",
        },
      },
      path,
      secretFetcher(),
    ),
  ).rejects.toThrow("Invalid secret version");
});
it("uploads unique backup objects and verifies the storage receipt", async () => {
  const path = join(directory(), "backup.sqlite");
  writeFileSync(path, "fixture");
  const fetcher = async (url, options) => {
    if (url.startsWith("http:")) return reply({ access_token: "token" });
    expect(url).toContain("ifGenerationMatch=0");
    expect(url).toContain("backups%2Ffixture.sqlite");
    return reply({
      size: options.body.length,
      md5Hash: createHash("md5").update(options.body).digest("base64"),
    });
  };
  await uploadFile(path, "test-backups", "backups/fixture.sqlite", fetcher);
  await expect(
    uploadFile(path, "test-backups", "../escape", fetcher),
  ).rejects.toThrow("Invalid backup destination");
  await expect(
    uploadFile(path, "test-backups", "backups/fixture.sqlite", async (url) =>
      url.startsWith("http:")
        ? reply({ access_token: "token" })
        : reply({ size: 0, md5Hash: "wrong" }),
    ),
  ).rejects.toThrow("verification");
});

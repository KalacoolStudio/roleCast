import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { databaseSchemaVersion } from "../../packages/storage/src/store.js";

export const supportedSchema = databaseSchemaVersion;
export function inspectDatabase(path) {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    if (db.pragma("integrity_check", { simple: true }) !== "ok")
      throw new Error("Database integrity check failed");
    return { schema: db.pragma("user_version", { simple: true }) };
  } finally {
    db.close();
  }
}
export function assertCompatible(path) {
  const info = inspectDatabase(path);
  if (info.schema !== supportedSchema)
    throw new Error("Database schema is not supported by this image");
  return info;
}
export async function backupDatabase(source, destination, release = {}) {
  // Reserve the destination; neither an existing backup nor a symlink can be overwritten.
  closeSync(openSync(destination, "wx", 0o600));
  let db;
  try {
    db = new Database(source, { readonly: true, fileMustExist: true });
    const deadline = Date.now() + 120_000;
    await db.backup(destination, {
      progress: () => {
        if (Date.now() > deadline) throw new Error("Backup timed out");
        return 100;
      },
    });
    const info = inspectDatabase(destination);
    const content = readFileSync(destination);
    const fd = openSync(destination, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    const manifest = {
      format: 1,
      createdAt: new Date().toISOString(),
      ...info,
      commit: release.commit || null,
      image: release.image || null,
      bytes: content.length,
      sha256: createHash("sha256").update(content).digest("hex"),
    };
    writeFileSync(
      `${destination}.json`,
      JSON.stringify(manifest, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    return manifest;
  } catch (error) {
    unlinkSync(destination);
    throw error;
  } finally {
    db?.close();
  }
}
export function verifyBackup(path, manifestPath = `${path}.json`) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const bytes = readFileSync(path);
  if (
    manifest.format !== 1 ||
    bytes.length !== manifest.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== manifest.sha256
  )
    throw new Error("Backup checksum mismatch");
  const info = assertCompatible(path);
  if (info.schema !== manifest.schema)
    throw new Error("Backup schema mismatch");
  return manifest;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [command, path, destination, commit, image] = process.argv.slice(2);
  try {
    if (command === "backup")
      console.log(
        JSON.stringify(
          await backupDatabase(path, destination, { commit, image }),
        ),
      );
    else if (command === "compatible")
      console.log(JSON.stringify(assertCompatible(path)));
    else if (command === "verify")
      console.log(JSON.stringify(verifyBackup(path, destination)));
    else throw new Error("Unknown database operation");
  } catch {
    console.error("Database operation failed; source data was not replaced.");
    process.exitCode = 1;
  }
}

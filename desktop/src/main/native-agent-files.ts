// GRIDA-SEC-004 / GRIDA-SEC-014 — physical files used for native configuration and executable pins.
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { parse, type TomlTable } from "smol-toml";

const execute = promisify(execFile);

export async function boundedFile(
  location: string,
  maximum: number,
  privateFile: boolean,
  executable = false,
  system = false,
  userOwned = false
): Promise<Buffer> {
  const handle = await fs.open(
    location,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  );
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.size > maximum ||
      (privateFile &&
        (stat.uid !== process.geteuid?.() ||
          (stat.mode & 0o7777) !== 0o600 ||
          stat.nlink !== 1)) ||
      (userOwned &&
        (stat.uid !== process.geteuid?.() ||
          (stat.mode & 0o022) !== 0 ||
          stat.nlink !== 1)) ||
      (executable &&
        ((stat.mode & 0o022) !== 0 || (stat.mode & 0o111) === 0)) ||
      (system && stat.uid !== 0)
    )
      throw new Error("native_hook_configuration_invalid");
    if (privateFile || userOwned) await noAcl(location);
    const data = Buffer.alloc(stat.size + 1);
    const { bytesRead } = await handle.read(data, 0, data.length, 0);
    const after = await handle.stat();
    if (
      bytesRead !== stat.size ||
      after.size !== stat.size ||
      after.mtimeMs !== stat.mtimeMs ||
      after.ctimeMs !== stat.ctimeMs
    )
      throw new Error("native_hook_configuration_invalid");
    return data.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
/** Global config needs integrity, not secret-directory permissions. Existing
 * Grida homes may be 0755; definitions and private receipts remain owner-writable. */
export async function sourceDirectory(location: string): Promise<void> {
  const stat = await fs.lstat(location);
  if (
    !stat.isDirectory() ||
    stat.uid !== process.geteuid?.() ||
    (stat.mode & 0o022) !== 0 ||
    (await fs.realpath(location)) !== location
  )
    throw new Error("native_hook_configuration_invalid");
  await noAcl(location);
}
export async function noAcl(location: string): Promise<void> {
  if (process.platform !== "darwin") return;
  const result = await execute("/bin/ls", ["-lde", location], {
    maxBuffer: 8192,
    env: { LC_ALL: "C", PATH: "/usr/bin:/bin" },
  });
  if (/^\s*\d+:/m.test(result.stdout))
    throw new Error("native_hook_configuration_invalid");
}

/** A missing home or config is an empty configuration. All other read failures are explicit. */
export async function readGlobalConfig(
  directory: string
): Promise<Buffer | null> {
  try {
    await sourceDirectory(directory);
    return await boundedFile(
      path.join(directory, "config.toml"),
      64 * 1024,
      false,
      false,
      false,
      true
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Each owner validates its own section; the version and the accepted root fields are shared. */
export function parseGlobalConfig(bytes: Buffer) {
  let text: string;
  let table: TomlTable;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    table = parse(text);
  } catch {
    throw new Error("native_hooks_toml_invalid");
  }
  const { desktop, hooks } = table;
  if (
    table.schema_version !== 1 ||
    Object.keys(table).some(
      (key) =>
        ![
          "schema_version",
          "hooks",
          "desktop",
          "web_search",
          // Preserve the retired feature table in existing config files.
          "features",
        ].includes(key)
    ) ||
    (hooks !== undefined && !Array.isArray(hooks)) ||
    (desktop !== undefined &&
      (!desktop ||
        typeof desktop !== "object" ||
        Array.isArray(desktop) ||
        desktop instanceof Date))
  )
    throw new Error("native_hooks_schema_invalid");
  return { text, table, desktop };
}

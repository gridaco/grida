// The update notice: a newer grida on npm's `latest` tag is named on stderr before a command
// runs. `grida fx` is covered too, since grida pins the Grida FX it runs.
//
// The notice reads only a local record. A detached process refreshes that record at most once a
// day with one anonymous GET of grida's public dist-tags; nothing about the user, the machine or
// the command is sent. Never in CI, with --json, when stderr is not a terminal, with
// GRIDA_NO_UPDATE_CHECK=1, or when GRIDA_HOME is set but not absolute. Failures stay silent.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DIST_TAGS = "https://registry.npmjs.org/-/package/grida/dist-tags";
export const INTERVAL_MS = 24 * 60 * 60 * 1000;
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/** Where the record lives: `$GRIDA_HOME/cli/update.json`, else `~/.grida/cli/update.json`. */
export function stateFile(env = process.env) {
  const home = env.GRIDA_HOME;
  if (home !== undefined) {
    return home && path.isAbsolute(home)
      ? path.join(home, "cli", "update.json")
      : null;
  }
  return path.join(homedir(), ".grida", "cli", "update.json");
}

/** Whether `candidate` is a later version than `current` (SemVer precedence). */
export function newer(candidate, current) {
  const a = SEMVER.exec(candidate);
  const b = SEMVER.exec(current);
  if (!a || !b) return false;
  for (let i = 1; i <= 3; i += 1) {
    if (Number(a[i]) !== Number(b[i])) return Number(a[i]) > Number(b[i]);
  }
  if (!a[4] || !b[4]) return !a[4] && Boolean(b[4]);
  const x = a[4].split(".");
  const y = b[4].split(".");
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if (x[i] === undefined) return false;
    if (y[i] === undefined) return true;
    if (x[i] === y[i]) continue;
    const [m, n] = [/^\d+$/.test(x[i]), /^\d+$/.test(y[i])];
    if (m && n) return Number(x[i]) > Number(y[i]);
    if (m !== n) return n;
    return x[i] > y[i];
  }
  return false;
}

/** Whether this invocation may show a notice or start a check. */
export function enabled(args, env = process.env, stderr = process.stderr) {
  return (
    Boolean(stderr.isTTY) &&
    !env.CI &&
    env.GRIDA_NO_UPDATE_CHECK !== "1" &&
    !args.includes("--json")
  );
}

/** The notice for `version` from a record, or null. */
export function notice(version, record) {
  const latest = record?.latest;
  if (typeof latest !== "string" || !newer(latest, version)) return null;
  return `grida ${latest} is available (this is ${version}). Update: npm install -g grida@latest\n`;
}

function readRecord(file) {
  try {
    const record = JSON.parse(readFileSync(file, "utf8"));
    return record && typeof record === "object" ? record : {};
  } catch {
    return {};
  }
}

/** Before a command: name a newer grida if the record knows one, and start a refresh when the
 * record is older than a day. Never throws and never waits for the network. */
export function checkForUpdate(
  args,
  {
    version,
    env = process.env,
    stderr = process.stderr,
    now = Date.now(),
    refresh = startRefresh,
  }
) {
  try {
    if (!enabled(args, env, stderr)) return;
    const file = stateFile(env);
    if (!file) return;
    const record = readRecord(file);
    const text = notice(version, record);
    if (text) stderr.write(text);
    const checked = Number(record.checked_at);
    if (!(checked <= now && now - checked < INTERVAL_MS)) refresh(file);
  } catch {}
}

function startRefresh(file) {
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), file],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {},
    }
  );
  child.on("error", () => {});
  child.unref();
}

/** Fetch grida's `latest` dist-tag and write the record; a failed check is recorded as a
 * check, keeping the last known version, so it is not retried within the day. */
export async function refresh(
  file,
  { fetch: get = fetch, now = Date.now } = {}
) {
  const previous = readRecord(file);
  let latest = typeof previous.latest === "string" ? previous.latest : null;
  try {
    const response = await get(DIST_TAGS, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) {
      const tags = await response.json();
      if (typeof tags?.latest === "string" && SEMVER.test(tags.latest))
        latest = tags.latest;
    }
  } catch {}
  try {
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(
      temporary,
      JSON.stringify({ checked_at: now(), latest }) + "\n",
      { mode: 0o600 }
    );
    renameSync(temporary, file);
  } catch {}
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2]) {
  await refresh(process.argv[2]);
}

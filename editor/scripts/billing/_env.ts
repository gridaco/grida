// Env loader for the billing CLI.
//
// EXPLICIT BY DESIGN. There is no side-effect import here — `cli.ts` calls
// `loadEnvSpec(...)` after parsing `--env=` so nothing is silently picked
// up from the cwd. A scripts run that forgets to specify `--env=` fails
// loudly instead of quietly running against whichever `.env.local` happens
// to be lying around.
//
// Spec values:
//   "dev"           load editor/.env.test.local → .env.test → .env.local
//                   (later files only fill keys not already present)
//   "<path>"        load exactly that file (absolute or relative to cwd)

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const EDITOR_DIR = path.resolve(__dirname, "..", "..");

/**
 * Expand a leading `~/` to the user's home directory. Shells only expand
 * `~` when it's at the start of an unquoted word, so `--env=~/foo`
 * arrives at the script as the literal string `~/foo` and
 * `path.resolve()` would otherwise glue it onto cwd. Mimic the shell's
 * intent.
 */
function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}
const DEV_FILES = [".env.test.local", ".env.test", ".env.local"];

export type LoadedEnv = {
  /** Spec the user passed (e.g. "dev" or a path). For display only. */
  spec: string;
  /** Files actually read, in order. */
  paths: string[];
};

export function loadEnvSpec(spec: string): LoadedEnv {
  if (!spec) throw new Error("loadEnvSpec: spec is empty");
  if (spec === "dev") return loadDev();
  return loadFile(path.resolve(expandHome(spec)));
}

function loadDev(): LoadedEnv {
  const paths: string[] = [];
  for (const name of DEV_FILES) {
    const full = path.join(EDITOR_DIR, name);
    if (fs.existsSync(full)) {
      readInto(full);
      paths.push(full);
    }
  }
  if (paths.length === 0) {
    throw new Error(
      `--env=dev: no env files found under ${EDITOR_DIR} (looked for ${DEV_FILES.join(", ")})`
    );
  }
  return { spec: "dev", paths };
}

function loadFile(filePath: string): LoadedEnv {
  if (!fs.existsSync(filePath)) {
    throw new Error(`--env=${filePath}: file not found`);
  }
  readInto(filePath);
  return { spec: filePath, paths: [filePath] };
}

function readInto(filePath: string): void {
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    // Existing process.env values win — anything set on the command line
    // (`FOO=bar pnpm tsx ...`) overrides what's in the file.
    if (!(k in process.env)) process.env[k] = v;
  }
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required (missing from loaded env).`);
  return v;
}

/**
 * Hard guard for setupStripe + smoke flows that must not touch live Stripe.
 * Even with the new explicit `--env=` flow + confirmation, this stays as a
 * belt-and-suspenders check — no script in this CLI is allowed to call
 * Stripe with a live key.
 */
export function requireStripeTestKey(): string {
  const sk = requireEnv("STRIPE_SECRET_KEY");
  if (!sk.startsWith("sk_test_")) {
    throw new Error("Refusing: STRIPE_SECRET_KEY must start with 'sk_test_'.");
  }
  if (process.env.BILLING_TEST_MODE !== "true") {
    throw new Error("Refusing: BILLING_TEST_MODE must be 'true'.");
  }
  return sk;
}

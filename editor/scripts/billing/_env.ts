// Shared env loader for billing scripts. Must be imported BEFORE any
// `lib/billing` import — those modules throw at load time on missing
// STRIPE_SECRET_KEY / SUPABASE_*.
//
// Precedence: process.env > .env.test.local > .env.test > .env.local

import * as fs from "node:fs";
import * as path from "node:path";

function loadFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
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
    if (!(k in process.env)) process.env[k] = v;
  }
}

const editorDir = path.resolve(__dirname, "..", "..");
loadFile(path.join(editorDir, ".env.test.local"));
loadFile(path.join(editorDir, ".env.test"));
loadFile(path.join(editorDir, ".env.local"));

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v)
    throw new Error(`${name} is required (set in editor/.env.test.local).`);
  return v;
}

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

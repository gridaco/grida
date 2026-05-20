#!/usr/bin/env -S pnpm tsx
// Billing CLI — single entry point for setup, smoke tests, and ops helpers.
//
// EXPLICIT BY DESIGN. This CLI is for one-off, human-driven runs against
// real external services (Stripe, Metronome, Supabase). It is NOT meant
// for CI. To prevent accidental cross-environment fires:
//
//   1. `--env=<spec>` is required. No env file is auto-loaded from cwd.
//   2. After loading, the CLI prints the loaded env (redacted) and the
//      action that's about to run, then waits for the user to type the
//      command name verbatim. Ctrl-C aborts.
//   3. If the loaded env contains `STRIPE_SECRET_KEY=sk_live_...`, the
//      confirmation prompt requires typing "PROD" instead of the command
//      name. Belt-and-suspenders: every Stripe-touching command in this
//      CLI also calls `requireStripeTestKey()` and refuses to run with a
//      live key (see `_env.ts`).
//
// Usage:
//
//   pnpm tsx editor/scripts/billing/cli.ts <command> --env=<spec>
//
//   --env=dev                    load editor/.env.test.local etc.
//   --env=/abs/path/to/file.env  load exactly that file
//
// Run with no args (or `--help`) for the command index.

import * as readline from "node:readline";
import { loadEnvSpec, type LoadedEnv } from "./_env";

type Cmd = {
  name: string;
  desc: string;
  run: () => Promise<void>;
};

// Env keys printed (redacted) in the confirmation summary. Only keys that
// commonly identify the target tenant — not every SUPABASE_* / STRIPE_*.
const SUMMARY_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "METRONOME_API_TOKEN",
  "METRONOME_WEBHOOK_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "BILLING_TEST_MODE",
  "WEBHOOK_TUNNEL_HOSTNAME",
  "ORG_FILTER",
  "DRY_RUN",
];

type Flags = {
  command: string;
  envSpec: string | null;
  helpOnly: boolean;
};

function parseFlags(argv: string[]): Flags {
  let command = "";
  let envSpec: string | null = null;
  let helpOnly = false;
  for (const arg of argv) {
    if (arg === "-h" || arg === "--help" || arg === "help") {
      helpOnly = true;
    } else if (arg.startsWith("--env=")) {
      envSpec = arg.slice("--env=".length);
    } else if (!command && !arg.startsWith("--")) {
      command = arg;
    }
  }
  return { command, envSpec, helpOnly };
}

function printUsage(commands: Cmd[]): void {
  console.log(
    "Usage: pnpm tsx editor/scripts/billing/cli.ts <command> --env=<spec>\n"
  );
  console.log("Required:");
  console.log("  --env=dev                load editor/.env.test.local etc.");
  console.log(
    "  --env=/path/to/file.env  load exactly that env file (use this for prod)"
  );
  console.log("\nCommands:");
  const w = Math.max(...commands.map((c) => c.name.length));
  for (const c of commands) {
    console.log(`  ${c.name.padEnd(w)}  ${c.desc}`);
  }
  console.log("\nSee editor/scripts/billing/README.md for env setup.");
}

function redact(value: string): string {
  if (value.length <= 8) return `${value[0] ?? ""}***`;
  return `${value.slice(0, 8)}*** (len=${value.length})`;
}

function printEnvSummary(loaded: LoadedEnv): void {
  console.log("env source:");
  for (const p of loaded.paths) console.log(`  ${p}`);
  console.log();
  console.log("loaded env (redacted):");
  for (const key of SUMMARY_KEYS) {
    const v = process.env[key];
    if (v === undefined) continue;
    console.log(`  ${key.padEnd(28)} ${redact(v)}`);
  }
}

function detectStripeMode(): "live" | "test" | "absent" {
  const sk = process.env.STRIPE_SECRET_KEY ?? "";
  if (sk.startsWith("sk_live_")) return "live";
  if (sk.startsWith("sk_test_")) return "test";
  return "absent";
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await new Promise<string>((resolve) => {
      rl.question(question, (answer) => resolve(answer));
    });
  } finally {
    rl.close();
  }
}

async function confirm(cmd: Cmd, loaded: LoadedEnv): Promise<void> {
  console.log("─".repeat(60));
  console.log("CONFIRMATION REQUIRED");
  console.log("─".repeat(60));
  console.log(`command: ${cmd.name}`);
  console.log(`action:  ${cmd.desc}`);
  console.log();
  printEnvSummary(loaded);
  console.log();

  const stripeMode = detectStripeMode();
  let expected: string;
  if (stripeMode === "live") {
    console.log(
      "⚠️  STRIPE LIVE MODE detected (sk_live_…). This is PRODUCTION."
    );
    console.log(
      "   (Stripe-touching commands in this CLI will refuse the live key,"
    );
    console.log("    but the DB / Metronome side may still mutate. Be sure.)");
    expected = "PROD";
  } else {
    if (stripeMode === "test") console.log("Stripe TEST mode (sk_test_…).");
    expected = cmd.name;
  }

  console.log();
  const answer = await prompt(
    `Type "${expected}" to continue, anything else to abort: `
  );
  if (answer.trim() !== expected) {
    console.error(
      `\nAborted (expected "${expected}", got "${answer.trim()}").`
    );
    process.exit(1);
  }
  console.log();
  console.log("─".repeat(60));
  console.log();
}

async function main(): Promise<void> {
  const setup = await import("./setup");
  const smoke = await import("./smoke");
  const ops = await import("./ops");

  const COMMANDS: Cmd[] = [
    {
      name: "setup:stripe",
      desc: "Provision Stripe products + prices + Customer Portal config (test mode).",
      run: setup.setupStripe,
    },
    {
      name: "setup:metronome",
      desc: "Provision Metronome billable metric, products, rate card + rate.",
      run: setup.setupMetronome,
    },
    {
      name: "ping",
      desc: "List Metronome customers / metrics / products / rate cards. Read-only.",
      run: smoke.ping,
    },
    {
      name: "smoke:topup",
      desc: "End-to-end prepaid-credit flow against a sandbox customer (no Stripe charge).",
      run: smoke.topup,
    },
    {
      name: "smoke:auto-reload",
      desc: "Provision Stripe + Metronome customer, enable auto-reload, drain, watch recharge.",
      run: smoke.autoReload,
    },
    {
      name: "smoke:webhook",
      desc: "3-layer probe of the Metronome webhook pipeline (localhost, tunnel, DB).",
      run: smoke.webhook,
    },
    {
      name: "backfill",
      desc: "Provision Metronome for every existing organization. ORG_FILTER / DRY_RUN env.",
      run: ops.backfill,
    },
    {
      name: "markup-sim",
      desc: "Audit the AI-credit markup formula across all Stripe card types.",
      run: ops.markupSim,
    },
  ];

  const flags = parseFlags(process.argv.slice(2));

  if (flags.helpOnly || (!flags.command && !flags.envSpec)) {
    printUsage(COMMANDS);
    return;
  }

  if (!flags.command) {
    console.error("error: command is required.\n");
    printUsage(COMMANDS);
    process.exit(2);
  }

  const cmd = COMMANDS.find((c) => c.name === flags.command);
  if (!cmd) {
    console.error(`error: unknown command "${flags.command}".\n`);
    printUsage(COMMANDS);
    process.exit(2);
  }

  if (!flags.envSpec) {
    console.error("error: --env=<spec> is required.\n");
    console.error(
      "  --env=dev                  load editor/.env.test.local etc."
    );
    console.error("  --env=/path/to/file.env    load exactly that env file");
    console.error(
      "\nNothing is auto-loaded from cwd — explicit by design (see _env.ts header).\n"
    );
    process.exit(2);
  }

  const loaded = loadEnvSpec(flags.envSpec);
  await confirm(cmd, loaded);
  await cmd.run();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

#!/usr/bin/env -S pnpm tsx
// Billing CLI — single entry point for setup, smoke tests, and ops helpers.
//
//   pnpm tsx editor/scripts/billing/cli.ts <command> [args]
//
// Run with no args for the command index. Env loading is handled by `_env`
// (auto-imported by each command module).

import "./_env";

type Cmd = {
  name: string;
  desc: string;
  run: () => Promise<void>;
};

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
      desc: "Provision Metronome billable metric, products, rate card + rate (sandbox).",
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

  const arg = process.argv[2];
  if (!arg || arg === "-h" || arg === "--help" || arg === "help") {
    console.log("Usage: pnpm tsx editor/scripts/billing/cli.ts <command>\n");
    console.log("Commands:");
    const w = Math.max(...COMMANDS.map((c) => c.name.length));
    for (const c of COMMANDS) {
      console.log(`  ${c.name.padEnd(w)}  ${c.desc}`);
    }
    console.log("\nSee editor/scripts/billing/README.md for env setup.");
    return;
  }

  const cmd = COMMANDS.find((c) => c.name === arg);
  if (!cmd) {
    console.error(`Unknown command: ${arg}`);
    console.error(`Run with --help for the command index.`);
    process.exit(2);
  }
  await cmd.run();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

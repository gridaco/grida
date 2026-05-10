// Sandbox smoke tests. Each is independently runnable and demonstrates one
// flow end-to-end against your sandbox accounts. Run via `cli.ts smoke <name>`.

import "./_env";
import * as crypto from "node:crypto";
import { requireEnv, requireStripeTestKey } from "./_env";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cents = (n?: number | null) =>
  n === undefined || n === null ? "—" : `$${(n / 100).toFixed(2)}`;

// ---------------------------------------------------------------------------
// ping — list customers / metrics / products / rate cards. Read-only.
// Verifies token + workspace.
// ---------------------------------------------------------------------------

export async function ping(): Promise<void> {
  requireEnv("METRONOME_API_TOKEN");
  const { metronome } = await import("../../lib/billing/metronome");

  const tryListing = async <T>(
    label: string,
    iter: () => AsyncIterable<T>,
    fmt: (item: T) => string
  ): Promise<void> => {
    try {
      const items: T[] = [];
      for await (const item of iter()) {
        items.push(item);
        if (items.length >= 5) break;
      }
      console.log(`\n${label} (first ${items.length}):`);
      for (const item of items) console.log(`  ${fmt(item)}`);
    } catch (err) {
      console.log(`\n${label}: ${(err as Error).message.split("\n")[0]}`);
    }
  };

  await tryListing(
    "customers",
    () => metronome.v1.customers.list(),
    (c) => `${c.id}  ${c.name ?? ""}`
  );
  await tryListing(
    "billable_metrics",
    () => metronome.v1.billableMetrics.list(),
    (m) => `${m.id}  ${m.name ?? ""}`
  );
  await tryListing(
    "contracts.products",
    () =>
      metronome.v1.contracts.products.list({ archive_filter: "NOT_ARCHIVED" }),
    (p) => `${p.id}  [${p.type ?? "?"}]  ${p.current?.name ?? ""}`
  );
  await tryListing(
    "contracts.rate_cards",
    () => metronome.v1.contracts.rateCards.list({ body: {} }),
    (r) => `${r.id}  ${r.name ?? ""}`
  );

  console.log("\nok.");
}

// ---------------------------------------------------------------------------
// topup — full prepaid-credit lifecycle. Demonstrates: customer match-or-
// create, contract with PREPAID complimentary commit, ingest event, balance
// drain. No Stripe charges (commit has no invoice_schedule).
// ---------------------------------------------------------------------------

const TOPUP_CUSTOMER = "grida-test-org";
const TOPUP_AMOUNT_CENTS = 2500; // $25

export async function topup(): Promise<void> {
  requireEnv("METRONOME_API_TOKEN");
  const { metronome, getSubstrate, hourFloor, FAR_FUTURE } =
    await import("../../lib/billing/metronome");

  console.log("\n--- step 1: look up substrate ---");
  const sub = await getSubstrate();
  console.log("  ok");

  console.log("\n--- step 2: match-or-create customer ---");
  let customerId: string | undefined;
  for await (const c of metronome.v1.customers.list()) {
    if (c.name === TOPUP_CUSTOMER) {
      customerId = c.id;
      break;
    }
  }
  if (customerId) {
    console.log(`  reusing ${customerId}`);
  } else {
    const r = await metronome.v1.customers.create({
      name: TOPUP_CUSTOMER,
      ingest_aliases: [TOPUP_CUSTOMER],
    });
    customerId = r.data.id;
    console.log(`  created ${customerId}`);
  }

  console.log(
    `\n--- step 3: create contract with ${cents(TOPUP_AMOUNT_CENTS)} PREPAID commit ---`
  );
  const startISO = hourFloor();
  const contract = await metronome.v1.contracts.create({
    customer_id: customerId,
    rate_card_id: sub.rateCardId,
    starting_at: startISO,
    name: `Test contract ${new Date().toISOString()}`,
    commits: [
      {
        product_id: sub.creditProductId,
        applicable_product_ids: [sub.usageProductId],
        type: "PREPAID",
        name: "Sandbox top-up $25",
        access_schedule: {
          schedule_items: [
            {
              amount: TOPUP_AMOUNT_CENTS,
              starting_at: startISO,
              ending_before: FAR_FUTURE,
            },
          ],
        },
      },
    ],
  });
  console.log(`  contract_id ${contract.data.id}`);

  console.log(
    `\n--- step 4: read balance (expect ${cents(TOPUP_AMOUNT_CENTS)}) ---`
  );
  await reportBalance(metronome, customerId);

  for (const [step, mills] of [
    [5, 5000],
    [8, 3000],
  ] as const) {
    console.log(`\n--- step ${step}: ingest ${mills} mills ---`);
    await metronome.v1.usage.ingest({
      usage: [
        {
          transaction_id: crypto.randomUUID(),
          customer_id: TOPUP_CUSTOMER,
          event_type: sub.eventType,
          timestamp: new Date().toISOString(),
          properties: { [sub.costProperty]: mills },
        },
      ],
    });
    console.log(`--- step ${step + 1}: wait 10s + read ---`);
    await sleep(10_000);
    await reportBalance(metronome, customerId);
  }
  console.log("\nok.");
}

// ---------------------------------------------------------------------------
// auto-reload — proves Metronome's prepaid_balance_threshold_configuration:
// on drain below threshold, Metronome charges Stripe and adds a fresh commit.
// ---------------------------------------------------------------------------

export async function autoReload(): Promise<void> {
  const sk = requireStripeTestKey();
  requireEnv("METRONOME_API_TOKEN");

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(sk, { apiVersion: "2026-04-22.dahlia" as never });
  const { metronome, getSubstrate, COMMIT_PRIORITY, hourFloor, FAR_FUTURE } =
    await import("../../lib/billing/metronome");
  const sub = await getSubstrate();

  const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const alias = `auto-reload-${RUN_ID}`;
  const THRESHOLD = 500; // $5
  const RECHARGE_TO = 2000; // $20
  const SEED = 700; // $7
  const SPEND_MILLS = 5000; // $5 worth

  console.log(`\n=== 1. Stripe customer + pm_card_visa ===`);
  const sc = await stripe.customers.create({
    name: alias,
    email: `${alias}@example.test`,
    metadata: { run_id: RUN_ID, scope: "auto-reload-smoke" },
  });
  const pm = await stripe.paymentMethods.attach("pm_card_visa", {
    customer: sc.id,
  });
  await stripe.customers.update(sc.id, {
    invoice_settings: { default_payment_method: pm.id },
  });
  console.log(`  stripe_customer_id ${sc.id}`);

  console.log(`\n=== 2. Metronome customer + contract (Stripe-linked) ===`);
  const customer = await metronome.v1.customers.create({
    name: alias,
    ingest_aliases: [alias],
    customer_billing_provider_configurations: [
      {
        billing_provider: "stripe",
        delivery_method: "direct_to_billing_provider",
        configuration: {
          stripe_customer_id: sc.id,
          stripe_collection_method: "charge_automatically",
        },
      },
    ],
  });
  const customerId = customer.data.id;
  const contract = await metronome.v1.contracts.create({
    customer_id: customerId,
    rate_card_id: sub.rateCardId,
    starting_at: hourFloor(),
    name: `Auto-reload smoke`,
    billing_provider_configuration: {
      billing_provider: "stripe",
      delivery_method: "direct_to_billing_provider",
    },
  });
  console.log(`  metronome_customer_id ${customerId}`);
  console.log(`  contract_id           ${contract.data.id}`);

  console.log(
    `\n=== 3. enable auto-reload (${cents(THRESHOLD)} → ${cents(RECHARGE_TO)}) ===`
  );
  await metronome.v2.contracts.edit({
    customer_id: customerId,
    contract_id: contract.data.id,
    add_prepaid_balance_threshold_configuration: {
      threshold_amount: THRESHOLD,
      recharge_to_amount: RECHARGE_TO,
      is_enabled: true,
      payment_gate_config: {
        payment_gate_type: "STRIPE",
        stripe_config: { payment_type: "PAYMENT_INTENT" },
        tax_type: "NONE",
      },
      commit: {
        product_id: sub.creditProductId,
        applicable_product_ids: [sub.usageProductId],
        priority: COMMIT_PRIORITY.TOPUP,
        name: "Auto-reload top-up",
      },
    } as never,
  });

  console.log(`\n=== 4. seed ${cents(SEED)} complimentary commit ===`);
  await metronome.v2.contracts.edit({
    customer_id: customerId,
    contract_id: contract.data.id,
    add_commits: [
      {
        product_id: sub.creditProductId,
        applicable_product_ids: [sub.usageProductId],
        type: "PREPAID",
        name: "Seed complimentary",
        priority: COMMIT_PRIORITY.PROMO,
        access_schedule: {
          schedule_items: [
            {
              amount: SEED,
              starting_at: hourFloor(),
              ending_before: FAR_FUTURE,
            },
          ],
        },
      },
    ],
  });
  await sleep(5_000);
  await reportBalance(metronome, customerId);

  console.log(
    `\n=== 5. drain (ingest ${SPEND_MILLS} mills = ${cents(SPEND_MILLS / 10)}) ===`
  );
  await metronome.v1.usage.ingest({
    usage: [
      {
        transaction_id: crypto.randomUUID(),
        customer_id: alias,
        event_type: sub.eventType,
        timestamp: new Date().toISOString(),
        properties: { [sub.costProperty]: SPEND_MILLS },
      },
    ],
  });
  await sleep(15_000);
  await reportBalance(metronome, customerId);

  console.log(`\n=== 6. poll up to 3 min for auto-recharge ===`);
  const start = Date.now();
  const deadline = start + 3 * 60_000;
  let observed = false;
  let lastTotal = -1;
  while (Date.now() < deadline) {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const commits = await listCommits(metronome, customerId);
    const total = commits.reduce((a, c) => a + (c.balance ?? 0), 0);
    const topupVisible = commits.some(
      (c) => c.name === "Auto-reload top-up" && (c.balance ?? 0) > 0
    );
    console.log(
      `  t+${String(elapsed).padStart(3, " ")}s  balance=${cents(total)}  commits=${commits.length}  topup_visible=${topupVisible}`
    );
    if (topupVisible && total > lastTotal && total > THRESHOLD) {
      observed = true;
      break;
    }
    lastTotal = total;
    await sleep(10_000);
  }

  console.log(`\n=== 7. final ===`);
  await reportBalance(metronome, customerId);
  console.log(
    observed ? "  ✓ auto-recharge observed" : "  ✗ NOT observed within 3 min"
  );

  const charges = await stripe.charges.list({ customer: sc.id, limit: 5 });
  console.log(`  stripe charges: ${charges.data.length}`);
  for (const ch of charges.data) {
    console.log(
      `    ${ch.id}  ${ch.status}  ${cents(ch.amount)}  paid=${ch.paid}`
    );
  }
}

// ---------------------------------------------------------------------------
// webhook — 3-layer probe: localhost → tunnel → DB. Each layer adds one
// variable so a failure pinpoints exactly which link is broken.
// ---------------------------------------------------------------------------

const LOCAL_URL = "http://localhost:3000/webhooks/metronome";
const TUNNEL_URL = "https://dev-webhooks.grida.co/webhooks/metronome";

export async function webhook(): Promise<void> {
  const secret = requireEnv("METRONOME_WEBHOOK_SECRET");
  const { createClient } = await import("@supabase/supabase-js");

  const colour = (c: string, s: string) => `\x1b[${c}m${s}\x1b[0m`;
  const ok = (s: string) => colour("32", s);
  const bad = (s: string) => colour("31", s);
  const dim = (s: string) => colour("90", s);

  const sign = (body: string, dateHeader: string) =>
    crypto
      .createHmac("sha256", secret)
      .update(`${dateHeader}\n${body}`)
      .digest("hex");

  type ProbeResult = {
    layer: number;
    url: string;
    eventId: string;
    ok: boolean;
    status?: number;
    body?: unknown;
    error?: string;
    durationMs: number;
  };

  const probe = async (layer: number, url: string): Promise<ProbeResult> => {
    const eventId = `smoke-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const dateHeader = new Date().toUTCString();
    const payload = {
      id: eventId,
      type: "webhooks.test",
      timestamp: new Date().toISOString(),
      properties: { source: "smoke webhook" },
    };
    const body = JSON.stringify(payload);
    const sig = sign(body, dateHeader);
    const start = Date.now();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          date: dateHeader,
          "metronome-webhook-signature": sig,
        },
        body,
      });
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      return {
        layer,
        url,
        eventId,
        ok: res.ok,
        status: res.status,
        body: parsed,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        layer,
        url,
        eventId,
        ok: false,
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  };

  const verifyDbRow = async (eventId: string) => {
    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY required"
      );
    }
    const sb = createClient(url, key);
    const { data, error } = await (
      sb.rpc as (
        n: string,
        p: object
      ) => Promise<{ data: unknown; error: { message: string } | null }>
    )("fn_billing_list_metronome_events", { p_org: null, p_limit: 100 });
    if (error)
      throw new Error(`fn_billing_list_metronome_events: ${error.message}`);
    const rows = (data ?? []) as Array<{
      event_id: string;
      event_type: string;
      processed_at: string | null;
    }>;
    return rows.find((r) => r.event_id === eventId) ?? null;
  };

  console.log(dim(`webhook smoke ${new Date().toISOString()}`));
  console.log(dim(`secret length=${secret.length} (${secret.slice(0, 4)}…)`));

  console.log(`\nLayer 1 ${dim("→")} ${LOCAL_URL}`);
  const r1 = await probe(1, LOCAL_URL);
  console.log(
    r1.ok
      ? `  ${ok("✓")} ${r1.status} (${r1.durationMs}ms) → ${JSON.stringify(r1.body)}`
      : `  ${bad("✗")} ${r1.status ?? "no response"} (${r1.durationMs}ms)${r1.error ? ` ${r1.error}` : ""}`
  );

  console.log(`\nLayer 2 ${dim("→")} ${TUNNEL_URL}`);
  const r2 = await probe(2, TUNNEL_URL);
  console.log(
    r2.ok
      ? `  ${ok("✓")} ${r2.status} (${r2.durationMs}ms) → ${JSON.stringify(r2.body)}`
      : `  ${bad("✗")} ${r2.status ?? "no response"} (${r2.durationMs}ms)${r2.error ? ` ${r2.error}` : ""}`
  );

  console.log(`\nLayer 3 ${dim("→")} read back metronome_event rows`);
  let dbOk = true;
  for (const r of [r1, r2]) {
    if (!r.ok) {
      console.log(`  ${dim("•")} L${r.layer} skipped`);
      continue;
    }
    try {
      const row = await verifyDbRow(r.eventId);
      if (row) {
        console.log(
          `  ${ok("✓")} L${r.layer} row found: type=${row.event_type} processed_at=${row.processed_at ?? "(null)"}`
        );
      } else {
        dbOk = false;
        console.log(`  ${bad("✗")} L${r.layer} row NOT found (${r.eventId})`);
      }
    } catch (err) {
      dbOk = false;
      console.log(
        `  ${bad("✗")} L${r.layer} db read failed: ${(err as Error).message}`
      );
    }
  }

  if (r1.ok && r2.ok && dbOk) {
    console.log(
      `\n${ok("ALL GREEN")} — pipeline wired. Next: send a test event from the Metronome dashboard.`
    );
    return;
  }
  console.log(`\n${bad("FAILED")}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type CommitRow = {
  id: string;
  name?: string;
  balance?: number;
  priority?: number;
};

async function listCommits(
  metronome: Awaited<typeof import("../../lib/billing/metronome").metronome>,
  customerId: string
): Promise<CommitRow[]> {
  const out: CommitRow[] = [];
  for await (const b of metronome.v1.contracts.listBalances({
    customer_id: customerId,
    covering_date: new Date().toISOString(),
    include_balance: true,
  })) {
    const x = b as {
      id: string;
      name?: string;
      balance?: number;
      priority?: number;
    };
    out.push({
      id: x.id,
      name: x.name,
      balance: x.balance,
      priority: x.priority,
    });
  }
  return out;
}

async function reportBalance(
  metronome: Awaited<typeof import("../../lib/billing/metronome").metronome>,
  customerId: string
): Promise<void> {
  const commits = await listCommits(metronome, customerId);
  const total = commits.reduce((a, c) => a + (c.balance ?? 0), 0);
  console.log(`  total ${cents(total)} across ${commits.length} commit(s)`);
  for (const c of commits) {
    console.log(
      `    [${c.id.slice(0, 8)}…] prio=${c.priority ?? "?"}  ${c.name ?? "(unnamed)"}: ${cents(c.balance)}`
    );
  }
}

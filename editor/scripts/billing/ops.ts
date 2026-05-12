// One-shot operational helpers — backfill, markup audit. Each is independently
// runnable and idempotent.
//
// Env loading + the explicit confirmation prompt live in `cli.ts`. These
// functions assume `process.env` is already populated.

// ---------------------------------------------------------------------------
// backfill — ensure every existing organization has a Metronome customer +
// contract provisioned. Mirrors the lazy `provisionOrg` call the user-facing
// billing page makes; running this ahead of cutover guarantees first-load
// is a no-op. `provisionOrg` is match-or-create; safe to re-run.
//
// Env knobs:
//   ORG_FILTER=255    one org by id (default: all)
//   DRY_RUN=true      report only
// ---------------------------------------------------------------------------

export async function backfill(): Promise<void> {
  const { service_role } = await import("../../lib/supabase/server");
  const { provisionOrg } = await import("../../lib/billing/metronome");

  const filterRaw = process.env.ORG_FILTER;
  const filterId =
    filterRaw && filterRaw !== "all" ? parseInt(filterRaw, 10) : null;
  const dryRun = process.env.DRY_RUN === "true";

  let q = service_role.workspace
    .from("organization")
    .select("id, name")
    .order("id", { ascending: true });
  if (filterId !== null) q = q.eq("id", filterId);
  const { data, error } = await q;
  if (error) throw new Error(`organization list: ${error.message}`);
  const orgs = (data ?? []) as Array<{ id: number; name: string }>;

  console.log(`[backfill] ${orgs.length} org(s)${dryRun ? " (dry-run)" : ""}`);
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  for (const org of orgs) {
    if (dryRun) {
      console.log(`  [dry] org=${org.id} name=${org.name}`);
      skipped++;
      continue;
    }
    try {
      const r = await provisionOrg(org.id);
      const note =
        r.created.customer || r.created.contract
          ? `created${r.created.customer ? " customer" : ""}${r.created.contract ? " contract" : ""}`
          : "already wired";
      console.log(
        `  ✓ org=${org.id} name=${org.name} → ${note} customer=${r.customerId} contract=${r.contractId}`
      );
      ok++;
    } catch (e) {
      console.error(
        `  ✗ org=${org.id} name=${org.name} → ${e instanceof Error ? e.message : String(e)}`
      );
      failed++;
    }
  }
  console.log(`\n[backfill] ok=${ok} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

// ---------------------------------------------------------------------------
// markup-sim — find a flat markup formula that NEVER loses money on any
// Stripe card type for top-ups in [$10, $500]. Audit trail for the formula
// in `lib/billing/fees.ts`. Re-run when Stripe rates change.
// ---------------------------------------------------------------------------

type CardType = { name: string; pct: number; fixed: number };
const CARDS: CardType[] = [
  { name: "us_card", pct: 0.029, fixed: 30 },
  { name: "intl_card", pct: 0.039, fixed: 30 },
  { name: "amex_us", pct: 0.035, fixed: 30 },
  { name: "intl_amex", pct: 0.044, fixed: 30 },
  { name: "us_card_fx", pct: 0.039, fixed: 30 },
  { name: "intl_card_fx", pct: 0.049, fixed: 30 },
];
const TEST_AMOUNTS_CENTS = [1000, 2500, 5000, 10000, 20000, 50000];

type Formula = { label: string; total: (creditCents: number) => number };
const flatPct = (p: number): Formula => ({
  label: `ceil(c * ${(1 + p).toFixed(3)})  [+${(p * 100).toFixed(1)}%]`,
  total: (c) => Math.ceil(c * (1 + p)),
});
const flatPctPlusFixed = (p: number, f: number): Formula => ({
  label: `ceil(c * ${(1 + p).toFixed(3)} + ${f})  [+${(p * 100).toFixed(1)}% + ${(f / 100).toFixed(2)}]`,
  total: (c) => Math.ceil(c * (1 + p) + f),
});
const grossUp = (p: number, f: number): Formula => ({
  label: `ceil((c + ${f}) / ${(1 - p).toFixed(3)})  [gross-up ${(p * 100).toFixed(1)}% + ${(f / 100).toFixed(2)}]`,
  total: (c) => Math.ceil((c + f) / (1 - p)),
});

const FORMULAS: Formula[] = [
  flatPct(0.04),
  flatPct(0.045),
  flatPct(0.05),
  flatPct(0.055),
  flatPct(0.06),
  flatPct(0.07),
  flatPct(0.08),
  flatPctPlusFixed(0.04, 50),
  flatPctPlusFixed(0.045, 30),
  flatPctPlusFixed(0.05, 30),
  flatPctPlusFixed(0.05, 50),
  flatPctPlusFixed(0.04, 75),
  grossUp(0.045, 30),
  grossUp(0.045, 50),
  grossUp(0.05, 30),
  grossUp(0.05, 50),
  grossUp(0.05, 75),
  grossUp(0.055, 30),
];

const dollars = (cents: number) =>
  `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

// Stripe rounds the fee up to the nearest cent.
const stripeFee = (amountCents: number, card: CardType) =>
  Math.ceil(amountCents * card.pct + card.fixed);

export async function markupSim(): Promise<void> {
  type Eval = {
    rows: Array<{
      amount: number;
      card: string;
      total: number;
      profit: number;
      markupPct: number;
    }>;
    worstLossCents: number;
    worstCardForLoss: string;
    bestCaseOver10: number;
    bestCaseOver10Pct: number;
    maxMarkupPctOnUs: number;
    maxOverchargeAnywhere: number;
  };

  const evaluate = (f: Formula): Eval => {
    const rows: Eval["rows"] = [];
    let worstLoss = 0;
    let worstCard = "";
    let bestCaseOver10 = 0;
    let bestCaseOver10Pct = 0;
    let maxUsMarkupPct = 0;
    let maxOverAny = 0;
    for (const amount of TEST_AMOUNTS_CENTS) {
      const total = f.total(amount);
      for (const card of CARDS) {
        const fee = stripeFee(total, card);
        const profit = total - fee - amount;
        const markupPct = (total - amount) / amount;
        rows.push({ amount, card: card.name, total, profit, markupPct });
        if (profit < worstLoss) {
          worstLoss = profit;
          worstCard = card.name;
        }
        if (card.name === "us_card") {
          if (amount === 1000) {
            bestCaseOver10 = profit;
            bestCaseOver10Pct = markupPct;
          }
          if (markupPct > maxUsMarkupPct) maxUsMarkupPct = markupPct;
          if (profit > maxOverAny) maxOverAny = profit;
        }
      }
    }
    return {
      rows,
      worstLossCents: worstLoss,
      worstCardForLoss: worstCard,
      bestCaseOver10,
      bestCaseOver10Pct,
      maxMarkupPctOnUs: maxUsMarkupPct,
      maxOverchargeAnywhere: maxOverAny,
    };
  };

  const summaries = FORMULAS.map((f) => ({ f, e: evaluate(f) }));

  console.log("# Markup formula simulation\n");
  console.log(
    "Goal: profit >= 0 on every card type, every credit in [$10, $500].\n"
  );
  console.log("## Summary\n");
  console.log(
    "| Formula | Safe? | Worst loss | Worst card | US $10 markup | Max US markup | Max US overcharge |"
  );
  console.log("|---|---|---|---|---|---|---|");
  for (const { f, e } of summaries) {
    console.log(
      `| \`${f.label}\` | ${e.worstLossCents >= 0 ? "yes" : "NO"} | ${dollars(e.worstLossCents)} | ${e.worstCardForLoss || "-"} | ${pct(e.bestCaseOver10Pct)} | ${pct(e.maxMarkupPctOnUs)} | ${dollars(e.maxOverchargeAnywhere)} |`
    );
  }

  // Filter to safe formulas, rank by US $10 markup pct then max US markup.
  const safe = summaries
    .filter((s) => s.e.worstLossCents >= 0)
    .sort((a, b) => {
      const pctDiff = a.e.bestCaseOver10Pct - b.e.bestCaseOver10Pct;
      return pctDiff !== 0
        ? pctDiff
        : a.e.maxMarkupPctOnUs - b.e.maxMarkupPctOnUs;
    });

  console.log("\n## Top safe candidates\n");
  for (const { f, e } of safe.slice(0, 3)) {
    console.log(`### \`${f.label}\`\n`);
    console.log(
      `- worst-case profit: ${dollars(e.worstLossCents)} on ${e.worstCardForLoss || "n/a"}`
    );
    console.log(
      `- US $10 markup: ${dollars(e.bestCaseOver10)} (${pct(e.bestCaseOver10Pct)})`
    );
    console.log(`- max US markup: ${pct(e.maxMarkupPctOnUs)}\n`);
    console.log(`| credit | ${CARDS.map((c) => c.name).join(" | ")} |`);
    console.log(`|---${CARDS.map(() => "|---").join("")}|`);
    for (const amount of TEST_AMOUNTS_CENTS) {
      const cells = [dollars(amount)];
      for (const card of CARDS) {
        const row = e.rows.find(
          (r) => r.amount === amount && r.card === card.name
        )!;
        cells.push(`${dollars(row.total)} → +${dollars(row.profit)}`);
      }
      console.log(`| ${cells.join(" | ")} |`);
    }
    console.log("");
  }

  console.log("## Card-type rates\n");
  console.log("| card | rate |");
  console.log("|---|---|");
  for (const c of CARDS)
    console.log(
      `| ${c.name} | ${(c.pct * 100).toFixed(1)}% + $${(c.fixed / 100).toFixed(2)} |`
    );
}

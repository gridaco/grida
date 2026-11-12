import { formatRate, type PublicModel } from "./catalogue";

export type PublicRate = PublicModel["gg"]["pricing"]["components"][number];
export type PriceSummaryLine = {
  key: string;
  label: string;
  /** A measured component's unit rate, never a computed request total. */
  price: string;
  conditional: boolean;
  from: boolean;
  /** Other distinct unit rates in this mutually exclusive schedule. */
  extraRates: number;
  hint: string | null;
  /** Original public schedules, including conditions, rounding and usage bands. */
  rates: readonly PublicRate[];
};
export type ModelPricing = {
  input: PriceSummaryLine[];
  output: PriceSummaryLine[];
  additional: PriceSummaryLine[];
};

/** An illustration is already in USD; preserve every decimal without meter conversion. */
export function formatIllustrativeAmount(amount: string): string {
  const [whole, fraction = ""] = amount.split(".");
  return `$${whole}.${fraction.padEnd(2, "0")}`;
}

const labels: Record<string, string> = {
  input_tokens: "Input",
  output_tokens: "Output",
  cached_input_tokens: "Cached input",
  cache_write_tokens: "Cache write",
  generations: "Generation",
  fal_output_units: "Output usage",
  fal_standard_cost_mills: "Output usage",
  provider_credits: "Provider credits",
};
const outputMeters = new Set([
  "output_tokens",
  "generations",
  "fal_output_units",
  "fal_standard_cost_mills",
  "provider_credits",
]);

/** Exact rational comparisons keep display ordering out of floating-point money math. */
function decimal(value: string): { numerator: bigint; denominator: bigint } {
  const [whole, fraction = ""] = value.split(".");
  return {
    numerator: BigInt(`${whole}${fraction}`),
    denominator: BigInt(10) ** BigInt(fraction.length),
  };
}
function ratio(rate: PublicRate): { numerator: bigint; denominator: bigint } {
  const amount = decimal(rate.rate_mills);
  const quantity = decimal(rate.per_quantity);
  return {
    numerator: amount.numerator * quantity.denominator,
    denominator: amount.denominator * quantity.numerator,
  };
}
function compareRates(a: PublicRate, b: PublicRate): number {
  const x = ratio(a),
    y = ratio(b);
  const difference = x.numerator * y.denominator - y.numerator * x.denominator;
  return difference < BigInt(0) ? -1 : difference > BigInt(0) ? 1 : 0;
}
function conditional(rate: PublicRate): boolean {
  const range = rate.quantity_range;
  return (
    Object.keys(rate.when).length > 0 ||
    (!!range &&
      (decimal(range.min).numerator !== BigInt(0) || range.max !== null)) ||
    rate.quantity_rounding.mode === "ceil"
  );
}

/** Public normalized billing units must not be relabeled as images or seconds. */
export function displayRate(rate: PublicRate): string {
  const formatted = formatRate(rate);
  if (rate.unit === "provider_unit")
    return formatted.replace(/provider unit(s?)$/, "usage unit$1");
  if (rate.unit === "mill")
    return formatted.replace(/mill(s?)$/, "usage mill$1");
  return formatted;
}

/** Half-open bands on the same meter cannot apply to the same request. */
function alternativeBands(rates: readonly PublicRate[]): boolean {
  const meter = rates[0].quantity_range?.meter;
  if (!meter || rates.some((rate) => rate.quantity_range?.meter !== meter))
    return false;
  const compareDecimals = (left: string, right: string) => {
    const l = decimal(left),
      r = decimal(right);
    const difference =
      l.numerator * r.denominator - r.numerator * l.denominator;
    return difference < BigInt(0) ? -1 : difference > BigInt(0) ? 1 : 0;
  };
  const bands = rates
    .map((rate) => rate.quantity_range!)
    .sort((a, b) => compareDecimals(a.min, b.min));
  return bands.every((band, i) => {
    if (i === 0) return true;
    const previous = bands[i - 1];
    return (
      previous.max !== null && compareDecimals(previous.max, band.min) <= 0
    );
  });
}

/**
 * Friendly discovery summaries, not an estimator or predicate evaluator. Only
 * proven alternative bands share a "From" line; possibly additive components
 * keep their own lines even when they measure the same unit at the same rate.
 */
export function modelPricing(model: PublicModel): ModelPricing {
  const buckets = new Map<string, PublicRate[]>();
  for (const rate of model.gg.pricing.components) {
    const key = JSON.stringify([rate.meter, rate.unit]);
    const bucket = buckets.get(key) ?? [];
    bucket.push(rate);
    buckets.set(key, bucket);
  }
  const groups = [...buckets].flatMap(([key, rates]) =>
    rates.length === 1 || alternativeBands(rates)
      ? [{ key, rates }]
      : rates.map((rate) => ({
          key: JSON.stringify([rate.meter, rate.unit, rate.id]),
          rates: [rate],
        }))
  );
  const result: ModelPricing = { input: [], output: [], additional: [] };
  for (const { key, rates: group } of groups) {
    const rates = [...group].sort(
      (a, b) =>
        compareRates(a, b) ||
        Number(b.per_quantity === "1") - Number(a.per_quantity === "1") ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
    const first = rates[0];
    let distinctRates = 1;
    for (let i = 1; i < rates.length; i++)
      if (compareRates(rates[i - 1], rates[i]) !== 0) distinctRates++;
    const hasConditions = rates.some(conditional);
    const from = distinctRates > 1;
    const line: PriceSummaryLine = {
      key,
      label: Object.hasOwn(labels, first.meter)
        ? labels[first.meter]
        : first.meter,
      price: `${from ? "From " : ""}${displayRate(first)}`,
      conditional: hasConditions,
      from,
      extraRates: distinctRates - 1,
      hint: hasConditions ? "Varies by input" : null,
      rates,
    };
    if (first.meter === "input_tokens") result.input.push(line);
    else if (outputMeters.has(first.meter)) result.output.push(line);
    else result.additional.push(line);
  }
  // Cached input always precedes write fees; unknown ancillary meters stay stable.
  result.additional.sort(
    (a, b) =>
      (a.rates[0].meter === "cached_input_tokens"
        ? 0
        : a.rates[0].meter === "cache_write_tokens"
          ? 1
          : 2) -
        (b.rates[0].meter === "cached_input_tokens"
          ? 0
          : b.rates[0].meter === "cache_write_tokens"
            ? 1
            : 2) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
  return result;
}

function groupedDecimal(value: string): string {
  const [whole, fraction] = value.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? `.${fraction}` : ""}`;
}
/** Exact friendly context bands, with no rounded or invented price thresholds. */
export function priceConditions(rate: PublicRate): string[] {
  const conditions: string[] = [];
  const range = rate.quantity_range;
  if (range) {
    const label =
      range.meter === "total_input_tokens"
        ? "total input tokens"
        : range.meter.replaceAll("_", " ");
    const zero = decimal(range.min).numerator === BigInt(0);
    if (
      zero &&
      range.meter.endsWith("_tokens") &&
      range.max !== null &&
      /^\d+$/.test(range.max) &&
      BigInt(range.max) > BigInt(0)
    )
      conditions.push(
        `Up to ${groupedDecimal(String(BigInt(range.max) - BigInt(1)))} ${label}`
      );
    else if (!zero && range.max === null)
      conditions.push(`${groupedDecimal(range.min)}+ ${label}`);
    else if (range.max !== null)
      conditions.push(
        `${label}: at least ${groupedDecimal(range.min)}, below ${groupedDecimal(range.max)}`
      );
  }
  if (Object.keys(rate.when).length > 0)
    conditions.push("Input or operation conditions apply");
  if (rate.quantity_rounding.mode === "ceil")
    conditions.push(
      `Usage rounded up in increments of ${rate.quantity_rounding.increment}`
    );
  return conditions;
}

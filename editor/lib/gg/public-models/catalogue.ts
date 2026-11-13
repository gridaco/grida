import type { z } from "zod";
import type { modelSchema, catalogueSchema } from "./schema";

export const kinds = [
  "text",
  "decision",
  "image",
  "video",
  "music",
  "speech",
  "three-d",
] as const;
export const modalities = [
  "text",
  "json",
  "image",
  "video",
  "audio",
  "three-d",
] as const;
export const kindLabels: Record<(typeof kinds)[number], string> = {
  text: "Text",
  decision: "Decisions",
  image: "Image",
  video: "Video",
  music: "Music",
  speech: "Speech",
  "three-d": "3D",
};
// Display vocabularies can grow independently of this application's labels.
export const maxDisplayValues = 64;
export function isDisplayValue(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 64 &&
    /^[A-Za-z0-9]/.test(value) &&
    !/[^A-Za-z0-9_.:-]/.test(value)
  );
}
export const modalityLabels: Record<string, string> = {
  text: "Text",
  json: "JSON",
  image: "Image",
  video: "Video",
  audio: "Audio",
  "three-d": "3D",
};
function displayLabel(
  labels: Readonly<Record<string, string>>,
  value: string
): string {
  return Object.hasOwn(labels, value) ? labels[value] : value;
}
export const kindLabel = (value: string): string =>
  displayLabel(kindLabels, value);
export const modalityLabel = (value: string): string =>
  displayLabel(modalityLabels, value);
const knownUnits = new Set([
  "token",
  "image",
  "megapixel",
  "second",
  "generation",
  "provider_credit",
  "provider_unit",
  "mill",
  "character",
]);
export type PublicModel = z.infer<typeof modelSchema>;
export type PublicIllustrativeCost = NonNullable<
  PublicModel["gg"]["illustrative_costs"]
>[number];
export type Catalogue = z.infer<typeof catalogueSchema>;
export type Filters = {
  q: string;
  kinds: string[];
  labs: string[];
  input: string[];
  output: string[];
};
export const emptyFilters: Filters = {
  q: "",
  kinds: [],
  labs: [],
  input: [],
  output: [],
};
const maxLabFilters = 64;
const validLab = (value: string) =>
  value.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
function normalizeList(
  values: readonly string[],
  valid: (value: string) => boolean,
  limit: number
): string[] {
  const selected = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (valid(trimmed)) selected.add(trimmed);
    if (selected.size >= limit) break;
  }
  return [...selected].sort();
}
function normalizeFilters(filter: Filters): Filters {
  let q = "";
  let length = 0;
  for (const point of filter.q) {
    if (length++ === 128) break;
    q += point;
  }
  return {
    q,
    kinds: normalizeList(filter.kinds, isDisplayValue, maxDisplayValues),
    labs: normalizeList(filter.labs, validLab, maxLabFilters),
    input: normalizeList(filter.input, isDisplayValue, maxDisplayValues),
    output: normalizeList(filter.output, isDisplayValue, maxDisplayValues),
  };
}
/** Page-only CSV filters: the public API still accepts a single kind and lab. */
export function parseFilters(params: URLSearchParams): Filters {
  const list = (key: string) => (params.get(key) ?? "").split(",");
  return normalizeFilters({
    q: params.get("q") ?? "",
    kinds: list("kind"),
    labs: list("lab"),
    input: list("input_modalities"),
    output: list("output_modalities"),
  });
}
/** Next's repeated query arrays follow the browser's first-value policy. */
export function parsePageFilters(
  params: Record<string, string | string[] | undefined>
): Filters {
  const query = new URLSearchParams();
  for (const [key, values] of Object.entries(params)) {
    const value = Array.isArray(values) ? values[0] : values;
    if (value !== undefined) query.set(key, value);
  }
  return parseFilters(query);
}
/** Canonical shareable page query; empty predicates are omitted. */
export function serializeFilters(filter: Filters): URLSearchParams {
  const normalized = normalizeFilters(filter);
  const params = new URLSearchParams();
  const entries = [
    ["q", normalized.q],
    ["kind", normalized.kinds.join(",")],
    ["lab", normalized.labs.join(",")],
    ["input_modalities", normalized.input.join(",")],
    ["output_modalities", normalized.output.join(",")],
  ];
  for (const [key, value] of entries) {
    if (value) params.set(key, value);
  }
  return params;
}
export function filterModels(
  models: readonly PublicModel[],
  filter: Filters
): PublicModel[] {
  const tokens = filter.q.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  return models.filter((model) => {
    const { gg } = model;
    if (
      (filter.kinds.length > 0 && !filter.kinds.includes(gg.kind)) ||
      (filter.labs.length > 0 && !filter.labs.includes(gg.card.lab.id))
    )
      return false;
    if (
      !filter.input.every((m) =>
        (gg.input_modalities as string[]).includes(m)
      ) ||
      (filter.output.length > 0 &&
        !filter.output.some((m) =>
          (gg.output_modalities as string[]).includes(m)
        ))
    )
      return false;
    const text = [
      model.id,
      gg.card.label,
      gg.card.description,
      gg.card.lab.id,
      gg.card.lab.name,
    ]
      .join(" ")
      .toLowerCase();
    return tokens.every((token) => text.includes(token));
  });
}
/** Exact decimal shift: rates are mills (one thousandth USD), never inferred prices. */
export function millsToUSD(mills: string): string {
  const [whole, fraction = ""] = mills.split(".");
  const digits = whole.padStart(4, "0");
  const dollars = digits.slice(0, -3).replace(/^0+(?=\d)/, "");
  const cents = `${digits.slice(-3)}${fraction}`.replace(/0+$/, "");
  return `$${dollars}${cents ? `.${cents.padEnd(2, "0")}` : ".00"}`;
}
export function formatRate(
  component: PublicModel["gg"]["pricing"]["components"][number]
): string {
  let amount = component.rate_mills;
  let per = component.per_quantity;
  if (component.unit === "token" && per === "1") {
    const [whole, fraction = ""] = amount.split(".");
    const digits = `${whole}${fraction}`.padEnd(
      whole.length + Math.max(6, fraction.length),
      "0"
    );
    const point = whole.length + 6;
    amount = `${digits.slice(0, point)}${digits.length > point ? `.${digits.slice(point)}` : ""}`;
    per = "1000000";
  }
  const quantity = per === "1000000" ? "1M" : per;
  const knownUnit = knownUnits.has(component.unit);
  const unit = knownUnit ? component.unit.replaceAll("_", " ") : component.unit;
  return `${millsToUSD(amount)} / ${quantity === "1" ? "" : `${quantity} `}${unit}${quantity !== "1" && knownUnit ? "s" : ""}`;
}

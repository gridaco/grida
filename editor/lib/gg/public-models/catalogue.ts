import type { z } from "zod";
import type { modelSchema, catalogueSchema } from "./schema";

export const kinds = [
  "text",
  "decision",
  "image",
  "video",
  "music",
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
  "three-d": "3D",
};
export type PublicModel = z.infer<typeof modelSchema>;
export type Catalogue = z.infer<typeof catalogueSchema>;
export type Filters = {
  q: string;
  kind: string;
  lab: string;
  input: string[];
  output: string[];
};
export const emptyFilters: Filters = {
  q: "",
  kind: "",
  lab: "",
  input: [],
  output: [],
};
export function parseFilters(params: URLSearchParams): Filters {
  const list = (key: string) =>
    [
      ...new Set(
        (params.get(key) ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => (modalities as readonly string[]).includes(s))
      ),
    ].sort();
  return {
    q: [...(params.get("q") ?? "")].slice(0, 128).join(""),
    kind: kinds.includes(params.get("kind") as (typeof kinds)[number])
      ? params.get("kind")!
      : "",
    lab: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(params.get("lab") ?? "")
      ? params.get("lab")!
      : "",
    input: list("input_modalities"),
    output: list("output_modalities"),
  };
}
export function filterModels(
  models: readonly PublicModel[],
  filter: Filters
): PublicModel[] {
  const tokens = filter.q.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  return models.filter((model) => {
    const { gg } = model;
    if (
      (filter.kind && gg.kind !== filter.kind) ||
      (filter.lab && gg.card.lab.id !== filter.lab)
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
  const unit = component.unit.replaceAll("_", " ");
  return `${millsToUSD(amount)} / ${quantity === "1" ? "" : `${quantity} `}${unit}${quantity === "1" ? "" : "s"}`;
}

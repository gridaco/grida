import { z } from "zod";
import { isDisplayValue, maxDisplayValues } from "./catalogue";

const displayValue = z.string().refine(isDisplayValue);

const decimal = z
  .string()
  .max(64)
  .regex(/^\d+(\.\d+)?$/)
  .refine((value) => value === value.trim());
const positiveDecimal = decimal.refine((v) => /[1-9]/.test(v));
const httpURL = z
  .string()
  .max(2048)
  .url()
  .refine((v) => {
    const url = new URL(v);
    return url.protocol === "https:" && !url.username && !url.password;
  });
const timestamp = z.iso.datetime({ offset: false });
const id = z.string().min(1).max(160);
const nonblankText = (maximum: number) =>
  z
    .string()
    .max(maximum)
    .refine((value) => /\S/u.test(value));
const illustrativeCost = z.object({
  operation_id: id,
  amount: decimal.refine((value) => /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value)),
  currency: z.literal("USD"),
  scenario: nonblankText(2048),
  coverage: nonblankText(4096),
  provenance: z.object({
    maintenance: z.literal("manual"),
    description: nonblankText(8192),
    reviewed_on: z.iso.date(),
    source_urls: z
      .array(
        z
          .string()
          .refine((value) => !/\s/u.test(value))
          .pipe(httpURL)
      )
      .min(1)
      .max(16)
      .optional(),
  }),
});
// Optional display metadata must not hide valid models or weaken their tariff checks.
const illustrativeCosts = z
  .array(z.unknown())
  .max(64)
  .transform((items) =>
    items.flatMap((item) => {
      const parsed = illustrativeCost.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    })
  )
  .optional()
  .catch(undefined);
const rate = z
  .object({
    id: z.string().min(1).max(321),
    meter: id,
    unit: displayValue,
    rate_mills: decimal,
    per_quantity: positiveDecimal,
    quantity_rounding: z.object({
      mode: z.enum(["none", "ceil"]),
      increment: positiveDecimal.nullable(),
    }),
    when: z.record(z.string(), z.json()),
    description: z.string().max(8192),
    quantity_range: z
      .object({ meter: id, min: decimal, max: decimal.nullable() })
      .optional(),
  })
  .refine((v) =>
    v.quantity_rounding.mode === "none"
      ? v.quantity_rounding.increment === null
      : v.quantity_rounding.increment !== null
  );
const logo = z.object({
  url: httpURL.refine((v) =>
    /^https:\/\/cdn\.jsdelivr\.net\/npm\/@grida\/ai-models@1\.[0-9]{8}\.[0-9]+\/logos\/[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(?:svg|png|webp)$/.test(
      v
    )
  ),
  media_type: z.enum(["image/svg+xml", "image/png", "image/webp"]),
  kind: z.enum(["symbol", "wordmark", "lockup"]),
});
export const modelSchema = z.object({
  id,
  object: z.literal("model"),
  created: z.number().int().nonnegative(),
  owned_by: z.string().max(160),
  gg: z
    .object({
      kind: displayValue,
      input_modalities: z.array(displayValue).max(maxDisplayValues),
      output_modalities: z.array(displayValue).min(1).max(maxDisplayValues),
      operation_ids: z.array(id).max(2048),
      pricing_context: displayValue,
      interfaces: z.array(z.string().max(160)).min(1).max(16),
      capabilities: z.record(z.string(), z.boolean()),
      limits: z.record(z.string(), z.number().nonnegative()),
      illustrative_costs: illustrativeCosts,
      pricing: z.object({
        revision: id,
        currency: z.literal("USD"),
        unit: z.literal("mill"),
        components: z.array(rate).min(1).max(2048),
        measurement: z.string().max(16384),
      }),
      card: z.object({
        label: z.string().min(1).max(512),
        description: z.string().max(16384).nullable(),
        lab: z.object({
          id: z
            .string()
            .max(64)
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
          name: z.string().min(1).max(256),
          url: httpURL,
          // Unused upstream artwork metadata must not hide an otherwise valid model.
          logo: logo.nullable().catch(null),
        }),
        release: z.object({
          date: z.iso.date().nullable(),
          source_url: httpURL,
          basis: displayValue,
        }),
      }),
      availability_ends_on: z.iso.date().nullable().optional(),
    })
    .transform((gg) => {
      if (!gg.illustrative_costs) return gg;
      const operations = new Set(gg.operation_ids);
      return {
        ...gg,
        illustrative_costs: gg.illustrative_costs.filter((example) =>
          operations.has(example.operation_id)
        ),
      };
    }),
});
export const catalogueSchema = z
  .object({
    object: z.literal("list"),
    revision: id,
    cards: z.object({
      version: z.string().min(1).max(160),
      commit: z.string().regex(/^[0-9a-f]{40}$/),
      url: httpURL,
    }),
    next_change_at: timestamp.nullable(),
    data: z.array(modelSchema).max(1024),
  })
  .superRefine((v, ctx) => {
    let previous = "";
    for (const model of v.data) {
      if (model.id <= previous)
        ctx.addIssue({
          code: "custom",
          message: "Models must be unique and ordered by ID",
        });
      previous = model.id;
      for (const list of [
        model.gg.input_modalities,
        model.gg.output_modalities,
        model.gg.operation_ids,
      ]) {
        if (
          new Set(list).size !== list.length ||
          list.some((item, i) => i > 0 && item <= list[i - 1])
        )
          ctx.addIssue({
            code: "custom",
            message: "Metadata lists must be unique and ordered",
          });
      }
      const retirement = model.gg.availability_ends_on;
      if (
        retirement &&
        (!v.next_change_at ||
          Date.parse(v.next_change_at) > Date.parse(`${retirement}T00:00:00Z`))
      )
        ctx.addIssue({
          code: "custom",
          message: "Retirement must bound snapshot validity",
        });
    }
  });

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { catalogueFixture, futureCatalogueFixture } from "./fixtures";
import { catalogueSchema } from "./schema";
import { emptyFilters } from "./catalogue";
import {
  formatIllustrativeAmount,
  formatIllustrativeCost,
  modelPricing,
} from "./pricing";
import { ModelDetails } from "../../../app/(www)/(models)/ai/models/model-details";
import { ModelsBrowser } from "../../../app/(www)/(models)/ai/models/models-browser";
import { CostConfigurations } from "../../../app/(www)/(models)/ai/models/cost-preview";

const example = {
  operation_id: "image.generate",
  amount: "0.0969",
  currency: "USD",
  scenario: "One 1024x1024 image at medium quality.",
  coverage: "Output component only; input and other charges excluded.",
  provenance: {
    maintenance: "manual",
    description: "A manually maintained illustration for these quantities.",
    reviewed_on: "2026-11-13",
  },
};

function withExamples(illustrative_costs: unknown) {
  const fixture = futureCatalogueFixture();
  return {
    ...fixture,
    data: fixture.data.map((model, index) =>
      index === 0
        ? {
            ...model,
            gg: {
              ...model.gg,
              operation_ids: ["image.generate"],
              illustrative_costs,
            },
          }
        : model
    ),
  };
}

describe("GG illustrative costs", () => {
  it("keeps old feeds valid without inventing an illustration or changing unit rates", () => {
    const catalogue = catalogueSchema.parse(catalogueFixture());
    expect(catalogue.data[0].gg.illustrative_costs).toBeUndefined();
    const withCost = catalogueSchema.parse(withExamples([example]));
    expect(modelPricing(withCost.data[0])).toEqual(
      modelPricing(catalogue.data[0])
    );
    const html = renderToStaticMarkup(
      createElement(ModelDetails, {
        model: catalogue.data[0],
        pricing: modelPricing(catalogue.data[0]),
        gatewayOrigin: "https://gateway.example",
      })
    );
    expect(html).toContain("Usage pricing");
    expect(html).not.toContain("Cost estimates");
  });

  it("preserves safe manual examples without URLs and strips unfamiliar optional fields", () => {
    const catalogue = catalogueSchema.parse(
      withExamples([{ ...example, future_metadata: "unused" }])
    );
    expect(catalogue.data[0].gg.illustrative_costs).toEqual([example]);
    expect(catalogue.data.at(-1)!.gg.kind).toBe("audio-analysis");
  });

  it.each([
    { ...example, amount: "NaN" },
    { ...example, amount: 0.0969 },
    { ...example, amount: "1e-3" },
    { ...example, amount: "-1" },
    { ...example, amount: "01" },
    { ...example, amount: "1\n" },
    { ...example, amount: "1".repeat(65) },
    { ...example, currency: "EUR" },
    { ...example, operation_id: "unadvertised.operation" },
    { ...example, operation_id: undefined, operation: "image.generate" },
    { ...example, scenario: " \n" },
    { ...example, coverage: "" },
    {
      ...example,
      provenance: { ...example.provenance, maintenance: "automatic" },
    },
    { ...example, provenance: { ...example.provenance, description: " " } },
    {
      ...example,
      provenance: { ...example.provenance, reviewed_on: "2026-02-30" },
    },
    { ...example, provenance: { ...example.provenance, source_urls: [] } },
    {
      ...example,
      provenance: {
        ...example.provenance,
        source_urls: ["javascript:alert(1)"],
      },
    },
    {
      ...example,
      provenance: {
        ...example.provenance,
        source_urls: ["http://example.com"],
      },
    },
    {
      ...example,
      provenance: {
        ...example.provenance,
        source_urls: ["https://user:secret@example.com"],
      },
    },
    {
      ...example,
      provenance: {
        ...example.provenance,
        source_urls: ["https://example.com/\n"],
      },
    },
    { ...example, provenance: null },
  ])(
    "omits an unsupported optional example while keeping the catalogue and supported examples",
    (invalid) => {
      const catalogue = catalogueSchema.parse(withExamples([invalid, example]));
      expect(catalogue.data).toHaveLength(4);
      expect(catalogue.data[0].gg.illustrative_costs).toEqual([example]);
    }
  );

  it.each([
    ["image", "1", "$0.0969/image"],
    ["image", "1.0", "$0.0969/image"],
    ["image", "2", "$0.0969/2 images"],
    ["video", "1", "$0.0969/video"],
    ["generation", "1", "$0.0969/generation"],
    ["task", "1", "$0.0969/task"],
    ["character", "500", "$0.0969/500 characters"],
    ["second", "10", "$0.0969/10 seconds"],
    ["second", "0.50", "$0.0969/0.50 seconds"],
    ["audio_frame", "3", "$0.0969/3 audio_frame"],
    ["constructor", "2", "$0.0969/2 constructor"],
  ])(
    "displays the authored %s/%s denominator without dividing the total",
    (unit, per_quantity, expected) => {
      const parsed = catalogueSchema.parse(
        withExamples([{ ...example, unit, per_quantity }])
      );
      const cost = parsed.data[0].gg.illustrative_costs![0];
      expect(cost.per_quantity).toBe(per_quantity);
      expect(formatIllustrativeCost(cost)).toBe(expected);
    }
  );

  it.each([
    {},
    { unit: "image" },
    { per_quantity: "1" },
    { unit: "IMAGE", per_quantity: "1" },
    { unit: "image\n", per_quantity: "1" },
    { unit: "image", per_quantity: "0" },
    { unit: "image", per_quantity: "0.00" },
    { unit: "image", per_quantity: "01" },
    { unit: "image", per_quantity: "1e3" },
    { unit: "image", per_quantity: "1\n" },
    { unit: "image", per_quantity: "1".repeat(65) },
    { unit: "a".repeat(65), per_quantity: "1" },
    { unit: 1, per_quantity: "1" },
    { unit: "image", per_quantity: 1 },
  ])(
    "keeps a valid cost when an optional denominator is absent or unsupported",
    (pair) => {
      const parsed = catalogueSchema.parse(
        withExamples([{ ...example, ...pair }])
      );
      expect(parsed.data).toHaveLength(4);
      const cost = parsed.data[0].gg.illustrative_costs![0];
      expect(cost.unit).toBeUndefined();
      expect(cost.per_quantity).toBeUndefined();
      expect(formatIllustrativeCost(cost)).toBe("$0.0969");
    }
  );

  it.each(["", " \n", "a".repeat(257), null, 12])(
    "falls back to the original scenario for an unsupported optional label",
    (label) => {
      const parsed = catalogueSchema.parse(
        withExamples([{ ...example, label }])
      );
      const cost = parsed.data[0].gg.illustrative_costs![0];
      expect(cost.label).toBeUndefined();
      const html = renderToStaticMarkup(
        createElement(CostConfigurations, { examples: [cost] })
      );
      expect(html).toContain(example.scenario);
    }
  );

  it("renders the compact configuration table using authored labels and exact totals", () => {
    const parsed = catalogueSchema.parse(
      withExamples([
        {
          ...example,
          label: "1024×1024 · Medium",
          unit: "image",
          per_quantity: "1",
        },
        { ...example, amount: "0.1234", unit: "image", per_quantity: "2" },
      ])
    );
    const html = renderToStaticMarkup(
      createElement(CostConfigurations, {
        examples: parsed.data[0].gg.illustrative_costs!,
      })
    );
    for (const text of [
      "Configuration",
      "Cost",
      "1024×1024 · Medium",
      example.scenario,
      "$0.0969/image",
      "$0.1234/2 images",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("$0.0617/image");
    expect(html).not.toContain(example.coverage);
    expect(html).not.toContain(example.provenance.description);
  });

  it("escapes authored configuration labels without treating them as HTML", () => {
    const parsed = catalogueSchema.parse(
      withExamples([{ ...example, label: "<script>untrusted</script>" }])
    );
    const html = renderToStaticMarkup(
      createElement(CostConfigurations, {
        examples: parsed.data[0].gg.illustrative_costs!,
      })
    );
    expect(html).toContain("&lt;script&gt;untrusted&lt;/script&gt;");
    expect(html).not.toContain("<script>untrusted");
  });

  it.each([null, {}, "unsupported", Array(65).fill(example)])(
    "omits unsupported optional arrays without hiding models",
    (invalid) => {
      const catalogue = catalogueSchema.parse(withExamples(invalid));
      expect(catalogue.data).toHaveLength(4);
      expect(catalogue.data[0].gg.illustrative_costs).toBeUndefined();
    }
  );

  it("never uses illustrations to rescue an invalid financial contract", () => {
    const invalid = withExamples([example]);
    invalid.data[0].gg.pricing.components[0].rate_mills = "NaN";
    expect(catalogueSchema.safeParse(invalid).success).toBe(false);
  });

  it.each([
    ["0", "$0.00"],
    ["1", "$1.00"],
    ["0.0969", "$0.0969"],
    ["0.000000001", "$0.000000001"],
    ["1.2300", "$1.2300"],
    ["9007199254740993.000001", "$9007199254740993.000001"],
  ])(
    "formats USD strings exactly without Number conversion: %s",
    (amount, formatted) => {
      expect(formatIllustrativeAmount(amount)).toBe(formatted);
    }
  );

  it("keeps the price summary compact and reveals scenario, coverage and provenance on demand", () => {
    const catalogue = catalogueSchema.parse(
      withExamples([
        {
          ...example,
          label: "1024×1024 · Medium",
          unit: "image",
          per_quantity: "1",
          provenance: {
            ...example.provenance,
            source_urls: ["https://gateway.example/docs/pricing"],
          },
        },
        {
          ...example,
          amount: "0.1234",
          scenario: "One 2048x2048 image at high quality.",
        },
      ])
    );
    const model = catalogue.data[0];
    const html = renderToStaticMarkup(
      createElement(ModelsBrowser, {
        initial: {
          state: "fresh",
          catalogue,
          served_at: 0,
          validated_at: 0,
          refresh_at: 60000,
          expires_at: 300000,
        },
        initialFilters: emptyFilters,
        gatewayOrigin: "https://gateway.example",
      })
    );
    for (const text of [
      "Media cost",
      "$0.0969/image",
      "+1 more",
      `aria-label="Media cost configurations for ${model.gg.card.label}"`,
      'aria-haspopup="dialog"',
      'aria-label="About media cost estimates"',
    ])
      expect(html).toContain(text);
    for (const text of [
      example.scenario,
      example.coverage,
      "image.generate",
      "About this estimate",
      "1024×1024 · Medium",
    ])
      expect(html).not.toContain(text);
    expect(html).not.toContain("$0.1234");
    expect(html).toContain("Input");
    expect(html).toContain("Output");
    const details = renderToStaticMarkup(
      createElement(ModelDetails, {
        model,
        pricing: modelPricing(model),
        gatewayOrigin: "https://gateway.example",
      })
    );
    for (const text of [
      "$0.0969",
      "$0.1234",
      example.scenario,
      example.coverage,
      "image.generate",
      "About this estimate",
      example.provenance.description,
      "Maintained manually",
      'dateTime="2026-11-13"',
      'href="https://gateway.example/docs/pricing"',
      "Usage pricing",
    ])
      expect(details).toContain(text);
  });

  it("escapes scenario/provenance text instead of interpreting markup", () => {
    const catalogue = catalogueSchema.parse(
      withExamples([{ ...example, scenario: "<script>untrusted</script>" }])
    );
    const model = catalogue.data[0];
    const html = renderToStaticMarkup(
      createElement(ModelDetails, {
        model,
        pricing: modelPricing(model),
        gatewayOrigin: "https://gateway.example",
      })
    );
    expect(html).toContain("&lt;script&gt;untrusted&lt;/script&gt;");
    expect(html).not.toContain("<script>untrusted");
  });
});

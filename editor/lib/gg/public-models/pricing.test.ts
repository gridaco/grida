import { describe, expect, it } from "vitest";
import { catalogueFixture } from "./fixtures";
import {
  displayRate,
  modelPricing,
  priceConditions,
  type PublicRate,
} from "./pricing";

function rate(
  meter: string,
  rate_mills: string,
  overrides: Partial<PublicRate> = {}
): PublicRate {
  return {
    id: `${meter}.${rate_mills}`,
    meter,
    unit: "token",
    rate_mills,
    per_quantity: "1",
    quantity_rounding: { mode: "none", increment: null },
    when: {},
    description: "Synthetic public rate.",
    ...overrides,
  };
}
function model(
  components: PublicRate[],
  kind: "text" | "image" | "music" | "decision" = "text"
) {
  const model = catalogueFixture().data[0];
  model.gg.kind = kind;
  model.gg.pricing.components = components;
  return model;
}

describe("friendly public pricing", () => {
  it("separates ordinary input/output from cached-input and cache-write fees", () => {
    const low = { meter: "total_input_tokens", min: "0", max: "272001" };
    const high = { meter: "total_input_tokens", min: "272001", max: null };
    const summary = modelPricing(
      model([
        rate("input_tokens", "0.002", { quantity_range: low }),
        rate("input_tokens", "0.004", { quantity_range: high }),
        rate("cached_input_tokens", "0.0002", { quantity_range: low }),
        rate("cached_input_tokens", "0.0004", { quantity_range: high }),
        rate("output_tokens", "0.01", { quantity_range: low }),
        rate("output_tokens", "0.015", { quantity_range: high }),
        rate("cache_write_tokens", "0.0025", { quantity_range: low }),
        rate("cache_write_tokens", "0.005", { quantity_range: high }),
      ])
    );
    expect(summary.input[0]).toMatchObject({
      label: "Input",
      price: "From $2.00 / 1M tokens",
      extraRates: 1,
      conditional: true,
      from: true,
    });
    expect(summary.output[0]).toMatchObject({
      label: "Output",
      price: "From $10.00 / 1M tokens",
      extraRates: 1,
    });
    expect(summary.additional.map((line) => [line.label, line.price])).toEqual([
      ["Cached input", "From $0.20 / 1M tokens"],
      ["Cache write", "From $2.50 / 1M tokens"],
    ]);
    expect(summary.input[0].rates).toHaveLength(2);
  });
  it("does not advertise cached-input rates as ordinary input or invent an output price", () => {
    const summary = modelPricing(
      model(
        [
          rate("input_tokens", "0.0001"),
          rate("cached_input_tokens", "0.00001"),
        ],
        "decision"
      )
    );
    expect(summary.input[0].price).toBe("$0.10 / 1M tokens");
    expect(summary.output).toEqual([]);
    expect(summary.additional[0].price).toBe("$0.01 / 1M tokens");
  });
  it("shows an exact generation price without claiming image, second or token equivalence", () => {
    const summary = modelPricing(
      model([rate("fal_output_units", "80", { unit: "generation" })], "music")
    );
    expect(summary.output[0]).toMatchObject({
      price: "$0.08 / generation",
      extraRates: 0,
      conditional: false,
      from: false,
    });
  });
  it("deduplicates equal conditional image/edit rates without fabricating a per-image quote", () => {
    const summary = modelPricing(
      model(
        [
          rate("fal_output_units", "35", {
            id: "text",
            unit: "provider_unit",
            when: { required: ["text"] },
          }),
          rate("fal_output_units", "35.000", {
            id: "edit",
            unit: "provider_unit",
            when: { required: ["image"] },
          }),
        ],
        "image"
      )
    );
    expect(summary.output[0]).toMatchObject({
      price: "$0.035 / usage unit",
      extraRates: 0,
      conditional: true,
      from: false,
      hint: "Varies by input",
    });
    expect(summary.output[0].rates).toHaveLength(2);
    expect(summary.output[0].price).not.toContain("image");
  });
  it("never sums or takes a minimum across additive meters or different units", () => {
    const summary = modelPricing(
      model(
        [
          rate("base", "100", { unit: "image" }),
          rate("duration", "50", { unit: "second" }),
          rate("duration", "10", { unit: "generation" }),
        ],
        "image"
      )
    );
    expect(summary.output.map((line) => line.price)).toEqual([
      "$0.10 / image",
      "$0.05 / second",
      "$0.01 / generation",
    ]);
    expect(
      summary.output.every((line) => !line.from && line.extraRates === 0)
    ).toBe(true);
  });
  it("compares decimal ratios exactly, including equivalent denominators and huge or tiny prices", () => {
    const summary = modelPricing(
      model([
        rate("output_tokens", "10000", {
          per_quantity: "1000000",
          id: "per-million",
        }),
        rate("output_tokens", "0.01", { id: "per-token" }),
        rate("output_tokens", "0.000000125", { id: "tiny" }),
      ])
    );
    expect(summary.output[0]).toMatchObject({
      price: "From $0.000125 / 1M tokens",
      extraRates: 1,
    });
    expect(summary.output[0].rates.map((r) => r.id)).toEqual([
      "tiny",
      "per-token",
      "per-million",
    ]);
    expect(
      displayRate(rate("input_tokens", "12345678901234567890.123456"))
    ).toBe("$12345678901234567890123.456 / 1M tokens");
    expect(displayRate(rate("amount", "1", { unit: "mill" }))).toBe(
      "$0.001 / usage mill"
    );
  });
  it("keeps the public schedules immutable and formats exact context/rounding conditions", () => {
    const component = rate("input_tokens", "0.002", {
      quantity_range: { meter: "total_input_tokens", min: "0", max: "272001" },
    });
    const source = model([component]);
    const before = JSON.stringify(source);
    modelPricing(source);
    expect(JSON.stringify(source)).toBe(before);
    expect(priceConditions(component)).toEqual([
      "Up to 272,000 total input tokens",
    ]);
    expect(
      priceConditions({
        ...component,
        quantity_range: { meter: "duration_seconds", min: "0", max: "10" },
      })
    ).toEqual(["duration seconds: at least 0, below 10"]);
    expect(
      priceConditions({
        ...component,
        quantity_range: { meter: "megapixels", min: "0.5", max: "2.25" },
      })
    ).toEqual(["megapixels: at least 0.5, below 2.25"]);
    expect(
      priceConditions({
        ...component,
        quantity_range: {
          meter: "total_input_tokens",
          min: "272001",
          max: null,
        },
        when: { required: ["image"] },
        quantity_rounding: { mode: "ceil", increment: "0.5" },
      })
    ).toEqual([
      "272,001+ total input tokens",
      "Input or operation conditions apply",
      "Usage rounded up in increments of 0.5",
    ]);
  });
});

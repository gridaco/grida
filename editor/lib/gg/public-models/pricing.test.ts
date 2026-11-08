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
  it("keeps potentially additive same-meter components separate, including equal rates", () => {
    const summary = modelPricing(
      model(
        [
          rate("fal_output_units", "35", {
            id: "base",
            unit: "provider_unit",
            when: { required: ["text"] },
          }),
          rate("fal_output_units", "35.000", {
            id: "reference",
            unit: "provider_unit",
            when: { required: ["image"] },
          }),
          rate("fal_output_units", "10", {
            id: "surcharge",
            unit: "provider_unit",
          }),
        ],
        "image"
      )
    );
    expect(summary.output.map((line) => line.price)).toEqual([
      "$0.035 / usage unit",
      "$0.035 / usage unit",
      "$0.01 / usage unit",
    ]);
    expect(
      summary.output.every((line) => !line.from && line.extraRates === 0)
    ).toBe(true);
    expect(summary.output.map((line) => line.rates[0].id)).toEqual([
      "base",
      "reference",
      "surcharge",
    ]);
    expect(new Set(summary.output.map((line) => line.key)).size).toBe(3);
  });
  it("does not collapse overlapping bands or bands on different context meters", () => {
    const summary = modelPricing(
      model([
        rate("output_tokens", "0.01", {
          id: "base",
          quantity_range: { meter: "input_tokens", min: "0", max: "100" },
        }),
        rate("output_tokens", "0.02", {
          id: "overlap",
          quantity_range: { meter: "input_tokens", min: "50", max: "200" },
        }),
        rate("output_tokens", "0.03", {
          id: "other-context",
          quantity_range: { meter: "images", min: "200", max: null },
        }),
      ])
    );
    expect(summary.output).toHaveLength(3);
    expect(summary.output.every((line) => !line.from)).toBe(true);
  });
  it("keeps unknown meter identities and does not assume that media charges measure output", () => {
    const summary = modelPricing(
      model(
        [
          rate("input_megapixels", "100", { unit: "megapixel" }),
          rate("duration", "50", { unit: "second" }),
          rate("duration", "10", { unit: "generation" }),
          rate("constructor", "1"),
        ],
        "image"
      )
    );
    expect(summary.input).toEqual([]);
    expect(summary.output).toEqual([]);
    expect(summary.additional.map((line) => [line.label, line.price])).toEqual([
      ["constructor", "$1000.00 / 1M tokens"],
      ["duration", "$0.01 / generation"],
      ["duration", "$0.05 / second"],
      ["input megapixels", "$0.10 / megapixel"],
    ]);
    expect(
      summary.additional.every((line) => !line.from && line.extraRates === 0)
    ).toBe(true);
  });
  it("compares decimal ratios exactly, including equivalent denominators and tiny prices", () => {
    const summary = modelPricing(
      model([
        rate("output_tokens", "10000", {
          per_quantity: "1000000",
          id: "per-million",
          quantity_range: { meter: "total_input_tokens", min: "0", max: "10" },
        }),
        rate("output_tokens", "0.01", {
          id: "per-token",
          quantity_range: { meter: "total_input_tokens", min: "10", max: "20" },
        }),
        rate("output_tokens", "0.000000125", {
          id: "tiny",
          quantity_range: { meter: "total_input_tokens", min: "20", max: null },
        }),
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
  it("distinguishes adjacent rates beyond Number precision despite reversed IDs", () => {
    const summary = modelPricing(
      model([
        rate("output_tokens", "9007199254740993", {
          id: "a-expensive",
          quantity_range: { meter: "total_input_tokens", min: "1", max: null },
        }),
        rate("output_tokens", "9007199254740992", {
          id: "z-cheaper",
          quantity_range: { meter: "total_input_tokens", min: "0", max: "1" },
        }),
      ])
    );
    expect(summary.output[0]).toMatchObject({
      price: "From $9007199254740992000.00 / 1M tokens",
      extraRates: 1,
    });
    expect(summary.output[0].rates.map((r) => r.id)).toEqual([
      "z-cheaper",
      "a-expensive",
    ]);
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

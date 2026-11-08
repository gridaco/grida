import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  filterModels,
  formatRate,
  millsToUSD,
  parseFilters,
  serializeFilters,
} from "./catalogue";
import { catalogueFixture } from "./fixtures";
import { catalogueSchema } from "./schema";
import { ModelsBrowser } from "../../../app/(www)/(models)/ai/models/models-browser";

describe("public models projection and local query", () => {
  it("validates a complete snapshot, strips unused wire data and rejects inconsistent retirement/order", () => {
    const fixture = catalogueFixture();
    const projected = catalogueSchema.parse({
      ...fixture,
      unused: "omitted",
      data: fixture.data.map((m) => ({
        ...m,
        gg: { ...m.gg, internal_unused: true },
      })),
    });
    expect(JSON.stringify(projected)).not.toMatch(/unused/);
    expect(
      catalogueSchema.safeParse({
        ...fixture,
        data: [...fixture.data].reverse(),
      }).success
    ).toBe(false);
    fixture.data[0].gg.pricing.components[0].id = `${"o".repeat(160)}/${"c".repeat(160)}`;
    expect(catalogueSchema.safeParse(fixture).success).toBe(true);
    fixture.data[0].gg.pricing.components[0].id += "x";
    expect(catalogueSchema.safeParse(fixture).success).toBe(false);
    fixture.data[0].gg.pricing.components[0].id = "output";
    fixture.data[0].gg.availability_ends_on = "2030-01-01";
    expect(catalogueSchema.safeParse(fixture).success).toBe(false);
    fixture.next_change_at = "2030-01-01T00:00:00Z";
    expect(catalogueSchema.safeParse(fixture).success).toBe(true);
  });
  it("uses literal Unicode AND search, input ALL and output ANY; defaults to every category", () => {
    const models = catalogueFixture().data;
    const filter = (query: string) =>
      filterModels(models, parseFilters(new URLSearchParams(query))).map(
        (m) => m.id
      );
    expect(filter("")).toHaveLength(3);
    expect(filter("q=éCLAIR+alpha")).toEqual(["alpha/Éclair"]);
    expect(filter("q=.*")).toEqual([]);
    expect(
      filter("input_modalities=text,image&output_modalities=audio,three-d")
    ).toEqual(["beta/music"]);
    expect(filter("kind=three-d&lab=beta")).toEqual(["beta/mesh"]);
    expect(filter("output_modalities=audio&lab=unknown")).toEqual([]);
  });
  it("ORs selections within category and lab, then ANDs independent predicates", () => {
    const models = catalogueFixture().data;
    const filter = (query: string) =>
      filterModels(models, parseFilters(new URLSearchParams(query))).map(
        (model) => model.id
      );
    expect(filter("kind=text,music")).toEqual(["alpha/Éclair", "beta/music"]);
    expect(filter("lab=alpha,beta")).toHaveLength(3);
    expect(filter("kind=text,music&lab=beta")).toEqual(["beta/music"]);
    expect(
      filter(
        "kind=text,three-d&lab=alpha,beta&input_modalities=image&output_modalities=text,three-d"
      )
    ).toEqual(["alpha/Éclair", "beta/mesh"]);
    expect(
      filter("kind=text,three-d&lab=alpha,beta&input_modalities=image,text")
    ).toEqual(["alpha/Éclair"]);
  });
  it("normalizes and round-trips shareable page queries without changing API filter semantics", () => {
    const parsed = parseFilters(
      new URLSearchParams({
        q: "Éclair + music",
        kind: "music, text,music,unknown",
        lab: "beta,alpha,beta,Invalid,invalid_name,",
        input_modalities: " text,image,text,unknown",
        output_modalities: "three-d,audio,audio",
      })
    );
    expect(parsed).toEqual({
      q: "Éclair + music",
      kinds: ["music", "text"],
      labs: ["alpha", "beta"],
      input: ["image", "text"],
      output: ["audio", "three-d"],
    });
    const serialized = serializeFilters(parsed);
    expect(serialized.get("kind")).toBe("music,text");
    expect(serialized.get("lab")).toBe("alpha,beta");
    expect(parseFilters(serialized)).toEqual(parsed);
    expect(
      serializeFilters(parseFilters(new URLSearchParams())).toString()
    ).toBe("");
    expect(
      serializeFilters({
        ...parsed,
        kinds: ["text", "music", "text"],
        labs: ["beta", "alpha"],
      }).toString()
    ).toBe(serialized.toString());
  });
  it("bounds query length and retained selections, accepting only known values and valid lab IDs", () => {
    const parsed = parseFilters(
      new URLSearchParams({
        q: "😀".repeat(129),
        kind: [...Array(20).fill("image"), "text", "invalid"].join(","),
        lab: [
          "x".repeat(65),
          ...Array.from({ length: 70 }, (_, i) => `lab-${i}`),
        ].join(","),
        input_modalities: "unknown,image,image",
      })
    );
    expect([...parsed.q]).toHaveLength(128);
    expect(parsed.kinds).toEqual(["image", "text"]);
    expect(parsed.labs).toHaveLength(64);
    expect(parsed.labs).not.toContain("x".repeat(65));
    expect(parsed.input).toEqual(["image"]);
    expect(parseFilters(serializeFilters(parsed))).toEqual(parsed);
  });
  it("preserves exact USD decimal rates without confusing mills and dollars", () => {
    expect(millsToUSD("0.0125000")).toBe("$0.0000125");
    expect(millsToUSD("80")).toBe("$0.08");
    expect(
      formatRate({
        ...catalogueFixture().data[0].gg.pricing.components[0],
        rate_mills: "0.000000125",
      })
    ).toBe("$0.000125 / 1M tokens");
    expect(millsToUSD("1000")).toBe("$1.00");
    expect(millsToUSD("12345678901234567890.123456")).toBe(
      "$12345678901234567.890123456"
    );
    const component = catalogueFixture().data[0].gg.pricing.components[0];
    expect(formatRate(component)).toBe("$10.00 / 1M tokens");
    expect(
      formatRate({ ...component, rate_mills: "12500", per_quantity: "1000000" })
    ).toBe("$12.50 / 1M tokens");
  });
  it("server-renders anonymous URL-selected models, conditional prices and honest unavailable/empty states", () => {
    const catalogue = catalogueFixture();
    const render = (query: string) =>
      renderToStaticMarkup(
        createElement(ModelsBrowser, {
          initial: {
            state: "fresh",
            catalogue,
            validated_at: 0,
            refresh_at: 60000,
            expires_at: 300000,
          },
          initialFilters: parseFilters(new URLSearchParams(query)),
        })
      );
    expect(render("kind=three-d")).toContain("beta/mesh");
    expect(render("kind=three-d")).not.toContain("alpha/Éclair");
    expect(render("kind=three-d")).toContain("Rates are selected by operation");
    expect(render("kind=three-d")).toContain("Applies when");
    expect(render("q=nothing")).toContain("No matching models");
    const unavailable = renderToStaticMarkup(
      createElement(ModelsBrowser, {
        initial: {
          state: "unavailable",
          catalogue: null,
          validated_at: null,
          refresh_at: 1000,
          expires_at: 0,
        },
        initialFilters: parseFilters(new URLSearchParams()),
      })
    );
    expect(unavailable).toContain("Models are temporarily unavailable");
    expect(unavailable).not.toContain("0 models");
  });
});

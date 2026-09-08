import { describe, expect, it } from "vitest";
import { MediaModelAvailability } from "./media-model-availability";
import { models } from "@grida/ai-models";

const catalogue = Object.freeze([
  { id: "alpha", label: "Alpha" },
  { id: "beta", label: "Beta" },
]);

describe("MediaModelAvailability.filter", () => {
  it("uses the full catalogue only when no restriction was provided", () => {
    expect(MediaModelAvailability.filter(catalogue)).toBe(catalogue);
  });

  it("keeps an explicit empty restriction empty", () => {
    expect(MediaModelAvailability.filter(catalogue, [])).toEqual([]);
  });

  it("returns an honest empty projection when no requested id exists", () => {
    expect(MediaModelAvailability.filter(catalogue, ["unknown"])).toEqual([]);
  });

  it("preserves catalogue order for the exact allowed ids", () => {
    expect(
      MediaModelAvailability.filter(catalogue, ["beta", "alpha", "beta"])
    ).toEqual(catalogue);
  });
});

describe("MediaModelAvailability.requiresImageUpdate", () => {
  const universal = models.image.models["openai/gpt-image-2"]!;
  const falOnly = {
    provider: "fal" as const,
    providers: { fal: universal.providers.fal },
  };

  it("keeps universal cards usable on existing clients", () => {
    expect(
      MediaModelAvailability.requiresImageUpdate(universal, "0.0.21")
    ).toBe(false);
  });

  it.each([undefined, "unknown", "0.0.21", "0.0.9"])(
    "blocks partial provider coverage on an unsupported client (%s)",
    (version) => {
      expect(MediaModelAvailability.requiresImageUpdate(falOnly, version)).toBe(
        true
      );
    }
  );

  it.each(["0.0.22", "0.0.22-insiders.1", "0.0.23", "0.1.0", "1.0.0"])(
    "accepts partial provider coverage on a compatible client (%s)",
    (version) => {
      expect(MediaModelAvailability.requiresImageUpdate(falOnly, version)).toBe(
        false
      );
    }
  );

  it("checks coverage instead of the model name or primary provider alone", () => {
    const partial = {
      ...universal,
      providers: { vercel: universal.providers.vercel },
    };
    expect(MediaModelAvailability.requiresImageUpdate(partial, "0.0.21")).toBe(
      true
    );
  });
});

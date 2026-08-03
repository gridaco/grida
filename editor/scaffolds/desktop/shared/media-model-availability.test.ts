import { describe, expect, it } from "vitest";
import { MediaModelAvailability } from "./media-model-availability";

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

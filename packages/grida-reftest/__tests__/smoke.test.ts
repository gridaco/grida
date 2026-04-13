import { describe, expect, it } from "vitest";
import { VERSION } from "../src/index";

describe("@grida/reftest smoke", () => {
  it("exports a version string", () => {
    expect(typeof VERSION).toBe("string");
  });
});

import { describe, expect, it } from "vitest";
import { parse_svg } from "../parser.js";

describe("parse_svg end-tag validation", () => {
  it("accepts a well-formed matching close tag", () => {
    expect(() =>
      parse_svg('<svg xmlns="http://www.w3.org/2000/svg"><g></g></svg>')
    ).not.toThrow();
  });

  it("rejects a mismatched end tag", () => {
    // </b> closing <a> would have silently popped before; now it throws.
    expect(() => parse_svg("<a><b></a></b>")).toThrow(/mismatched end tag/);
  });

  it("rejects an end tag with no matching open", () => {
    expect(() => parse_svg("</a>")).toThrow(/unexpected end tag/);
  });
});

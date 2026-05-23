import { describe, expect, it } from "vitest";
import { formatSvg } from "./format-svg";

describe("formatSvg", () => {
  it("puts each element on its own line with depth-based indentation", () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="50" height="40" fill="red"/><circle cx="80" cy="20" r="5" fill="blue"/></svg>`;
    expect(formatSvg(input)).toBe(
      [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">`,
        `  <rect x="10" y="10" width="50" height="40" fill="red"/>`,
        `  <circle cx="80" cy="20" r="5" fill="blue"/>`,
        `</svg>`,
      ].join("\n")
    );
  });

  it("nests groups correctly", () => {
    const input = `<svg><g id="a"><rect/></g><g id="b"><circle/></g></svg>`;
    expect(formatSvg(input)).toBe(
      [
        `<svg>`,
        `  <g id="a">`,
        `    <rect/>`,
        `  </g>`,
        `  <g id="b">`,
        `    <circle/>`,
        `  </g>`,
        `</svg>`,
      ].join("\n")
    );
  });

  it("keeps mixed text content inline", () => {
    const input = `<svg><text x="0" y="0">Hello</text></svg>`;
    expect(formatSvg(input)).toBe(
      [`<svg>`, `  <text x="0" y="0">Hello</text>`, `</svg>`].join("\n")
    );
  });

  it("collapses existing inter-element whitespace", () => {
    const input = `<svg>\n  <rect/>\n\n  <circle/>\n</svg>`;
    expect(formatSvg(input)).toBe(
      [`<svg>`, `  <rect/>`, `  <circle/>`, `</svg>`].join("\n")
    );
  });

  it("idempotent — formatting a formatted document yields the same string", () => {
    const input = `<svg><g><rect/></g></svg>`;
    const once = formatSvg(input);
    expect(formatSvg(once)).toBe(once);
  });

  it("preserves XML / DOCTYPE metadata tags at depth 0", () => {
    const input = `<?xml version="1.0"?><svg><rect/></svg>`;
    expect(formatSvg(input)).toBe(
      [`<?xml version="1.0"?>`, `<svg>`, `  <rect/>`, `</svg>`].join("\n")
    );
  });
});

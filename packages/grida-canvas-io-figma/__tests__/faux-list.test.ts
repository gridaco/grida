/**
 * Tests for faux-list transform (faux-list.ts).
 *
 * Validates that Figma list metadata (lineTypes, lineIndentations) is
 * correctly converted into inline bullet/number prefixes with proper
 * offset shifting for styled runs and characterStyleOverrides.
 */
import { describe, it, expect } from "vitest";
import {
  applyFauxList,
  shiftRanges,
  shiftCharOverrides,
  type CharRange,
  type FigmaLineType,
} from "../faux-list";

// ---------------------------------------------------------------------------
// applyFauxList — text rewriting
// ---------------------------------------------------------------------------

describe("applyFauxList", () => {
  it("returns null when there are no list lines", () => {
    const result = applyFauxList({
      text: "Hello\nWorld",
      lineTypes: ["NONE", "NONE"],
      lineIndentations: [0, 0],
    });
    expect(result).toBeNull();
  });

  it("returns null when lineTypes is empty", () => {
    const result = applyFauxList({
      text: "Hello",
      lineTypes: [],
      lineIndentations: [],
    });
    expect(result).toBeNull();
  });

  it("prepends bullet for unordered list lines", () => {
    const result = applyFauxList({
      text: "Item A\nItem B\nItem C",
      lineTypes: ["UNORDERED", "UNORDERED", "UNORDERED"],
      lineIndentations: [0, 0, 0],
    });
    expect(result).not.toBeNull();
    expect(result!.text).toBe("• Item A\n• Item B\n• Item C");
    // "• " is 2 chars
    expect(result!.prefixLengths).toEqual([2, 2, 2]);
  });

  it("prepends numbers for ordered list lines", () => {
    const result = applyFauxList({
      text: "First\nSecond\nThird",
      lineTypes: ["ORDERED", "ORDERED", "ORDERED"],
      lineIndentations: [0, 0, 0],
    });
    expect(result).not.toBeNull();
    expect(result!.text).toBe("1. First\n2. Second\n3. Third");
  });

  it("mixes NONE, ORDERED, and UNORDERED lines", () => {
    const result = applyFauxList({
      text: "Title\nApple\nBanana\nStep one\nStep two",
      lineTypes: ["NONE", "UNORDERED", "UNORDERED", "ORDERED", "ORDERED"],
      lineIndentations: [0, 0, 0, 0, 0],
    });
    expect(result).not.toBeNull();
    const lines = result!.text.split("\n");
    expect(lines[0]).toBe("Title");
    expect(lines[1]).toBe("• Apple");
    expect(lines[2]).toBe("• Banana");
    expect(lines[3]).toBe("1. Step one");
    expect(lines[4]).toBe("2. Step two");
  });

  it("applies indentation with nesting", () => {
    const result = applyFauxList({
      text: "Top\nNested\nDeep",
      lineTypes: ["UNORDERED", "UNORDERED", "UNORDERED"],
      lineIndentations: [0, 1, 2],
    });
    expect(result).not.toBeNull();
    const lines = result!.text.split("\n");
    expect(lines[0]).toBe("• Top");
    expect(lines[1]).toBe("    • Nested"); // indent=1: 4 spaces + "• "
    expect(lines[2]).toBe("        • Deep"); // indent=2: 8 spaces + "• "
  });

  it("uses same bullet at all nesting levels", () => {
    const result = applyFauxList({
      text: "L0\nL1\nL2\nL3",
      lineTypes: ["UNORDERED", "UNORDERED", "UNORDERED", "UNORDERED"],
      lineIndentations: [0, 1, 2, 3],
    });
    expect(result).not.toBeNull();
    const lines = result!.text.split("\n");
    expect(lines[0]).toBe("• L0");
    expect(lines[1]).toBe("    • L1");
    expect(lines[2]).toBe("        • L2");
    expect(lines[3]).toBe("            • L3");
  });

  it("resets ordered counter when a NONE line breaks the sequence", () => {
    const result = applyFauxList({
      text: "A\nB\nBreak\nC\nD",
      lineTypes: ["ORDERED", "ORDERED", "NONE", "ORDERED", "ORDERED"],
      lineIndentations: [0, 0, 0, 0, 0],
    });
    expect(result).not.toBeNull();
    const lines = result!.text.split("\n");
    expect(lines[0]).toBe("1. A");
    expect(lines[1]).toBe("2. B");
    expect(lines[2]).toBe("Break");
    expect(lines[3]).toBe("1. C"); // counter resets
    expect(lines[4]).toBe("2. D");
  });

  it("handles lineTypes shorter than line count (missing = NONE)", () => {
    const result = applyFauxList({
      text: "A\nB\nC",
      lineTypes: ["UNORDERED"],
      lineIndentations: [0],
    });
    expect(result).not.toBeNull();
    const lines = result!.text.split("\n");
    expect(lines[0]).toBe("• A");
    expect(lines[1]).toBe("B"); // no prefix
    expect(lines[2]).toBe("C");
  });

  it("handles empty text", () => {
    const result = applyFauxList({
      text: "",
      lineTypes: ["UNORDERED"],
      lineIndentations: [0],
    });
    expect(result).not.toBeNull();
    expect(result!.text).toBe("• ");
  });

  it("handles double-digit ordered numbers (prefix length varies)", () => {
    const items = Array.from({ length: 12 }, (_, i) => `Item ${i + 1}`);
    const result = applyFauxList({
      text: items.join("\n"),
      lineTypes: items.map(() => "ORDERED" as FigmaLineType),
      lineIndentations: items.map(() => 0),
    });
    expect(result).not.toBeNull();
    const lines = result!.text.split("\n");
    expect(lines[0]).toBe("1. Item 1");
    expect(lines[8]).toBe("9. Item 9");
    expect(lines[9]).toBe("10. Item 10"); // 4-char prefix "10. "
    expect(lines[11]).toBe("12. Item 12");
    // Prefix lengths: "1. " = 3 for items 1-9, "10. " = 4 for 10-12
    expect(result!.prefixLengths[0]).toBe(3);
    expect(result!.prefixLengths[9]).toBe(4);
    expect(result!.prefixLengths[11]).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// shiftRanges — styled run offset adjustment
// ---------------------------------------------------------------------------

describe("shiftRanges", () => {
  it("shifts single-line ranges correctly", () => {
    // Original: "Hello" → "• Hello"  (prefix = "• " = 2 chars)
    const ranges: CharRange[] = [{ start: 0, end: 5 }];
    shiftRanges(ranges, "Hello", [2]);
    expect(ranges[0]).toEqual({ start: 2, end: 7 });
  });

  it("shifts multi-line ranges correctly", () => {
    // Original: "AB\nCD"
    // lineTypes: UNORDERED, UNORDERED → "• AB\n• CD"
    // prefixLengths: [2, 2]
    //
    // Original offsets: A=0, B=1, \n=2, C=3, D=4
    // New offsets:      •=0, ' '=1, A=2, B=3, \n=4, •=5, ' '=6, C=7, D=8
    const ranges: CharRange[] = [
      { start: 0, end: 2 }, // "AB" in original
      { start: 3, end: 5 }, // "CD" in original
    ];
    shiftRanges(ranges, "AB\nCD", [2, 2]);
    expect(ranges[0]).toEqual({ start: 2, end: 4 }); // "AB" in new text
    expect(ranges[1]).toEqual({ start: 7, end: 9 }); // "CD" in new text
  });

  it("handles ranges that span across lines", () => {
    // Original: "AB\nCD" → "• AB\n• CD"
    // A range spanning the newline: [1, 4) = "B\nC"
    const ranges: CharRange[] = [{ start: 1, end: 4 }];
    shiftRanges(ranges, "AB\nCD", [2, 2]);
    // B is at orig 1 (line 0) → new offset 1+2=3
    // C is at orig 3 (line 1) → new offset 3+4=7
    expect(ranges[0]).toEqual({ start: 3, end: 8 });
  });

  it("does nothing when there are no ranges", () => {
    const ranges: CharRange[] = [];
    shiftRanges(ranges, "AB\nCD", [2, 2]);
    expect(ranges).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// shiftCharOverrides — characterStyleOverrides adjustment
// ---------------------------------------------------------------------------

describe("shiftCharOverrides", () => {
  it("inserts base-style zeros for prefix characters", () => {
    // Original: "AB\nCD", overrides: [1, 1, 0, 2, 2]
    // (A=1, B=1, \n=0, C=2, D=2)
    // After faux-list with prefixLengths [2, 2]:
    // "• AB\n• CD" → overrides should be [0, 0, 1, 1, 0, 0, 0, 2, 2]
    const result = shiftCharOverrides([1, 1, 0, 2, 2], "AB\nCD", [2, 2]);
    expect(result).toEqual([0, 0, 1, 1, 0, 0, 0, 2, 2]);
  });

  it("handles single line with no list prefix", () => {
    const result = shiftCharOverrides([1, 2, 3], "ABC", [0]);
    expect(result).toEqual([1, 2, 3]);
  });

  it("handles overrides shorter than text (pads with 0)", () => {
    const result = shiftCharOverrides([1], "ABC", [2]);
    // "• ABC" → [0, 0, 1, 0, 0]
    expect(result).toEqual([0, 0, 1, 0, 0]);
  });

  it("handles empty text", () => {
    const result = shiftCharOverrides([], "", [2]);
    // "• " → [0, 0]
    expect(result).toEqual([0, 0]);
  });

  it("handles mixed prefix lengths (some zero)", () => {
    // "Title\nItem A" with lineTypes ["NONE", "UNORDERED"]
    // prefixLengths: [0, 2]
    // overrides: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]
    //             T  i  t  l  e  \n I  t  e  m  _  A
    const origOverrides = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
    const result = shiftCharOverrides(origOverrides, "Title\nItem A", [0, 2]);
    // Expected: Title chars unchanged, then 2 zeros for "• ", then Item A chars
    expect(result).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
  });
});

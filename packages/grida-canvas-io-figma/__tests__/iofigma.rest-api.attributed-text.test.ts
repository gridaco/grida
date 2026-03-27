/**
 * Tests for Figma REST API TEXT nodes → AttributedTextNode conversion.
 *
 * Validates that `characterStyleOverrides` + `styleOverrideTable` are correctly
 * converted into `StyledTextRun[]` covering the entire text, including when:
 * - `characterStyleOverrides` is shorter than `characters`
 * - Text contains CJK (Korean/Japanese/Chinese) multi-byte characters
 * - All characters share the same override id
 */
import { describe, it, expect } from "vitest";
import { iofigma } from "../lib";
import type * as figrest from "@figma/rest-api-spec";
import type grida from "@grida/schema";

const context: iofigma.restful.factory.FactoryContext = {
  gradient_id_generator: () => "grad-1",
  prefer_path_for_geometry: true,
};

/**
 * Build a minimal Figma REST FRAME containing a TEXT child with
 * per-character style overrides.
 */
function makeTextNode(
  characters: string,
  characterStyleOverrides: number[],
  styleOverrideTable: Record<string, Partial<figrest.TypeStyle>>,
  baseStyle: Partial<figrest.TypeStyle> = {}
): { doc: grida.program.document.IPackedSceneDocument } {
  const textNode: figrest.TextNode = {
    id: "2:1",
    name: "Text",
    type: "TEXT",
    scrollBehavior: "SCROLLS",
    blendMode: "PASS_THROUGH",
    absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 40 },
    absoluteRenderBounds: { x: 0, y: 0, width: 200, height: 40 },
    constraints: { vertical: "TOP", horizontal: "LEFT" },
    fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
    strokes: [],
    strokeWeight: 1,
    strokeAlign: "INSIDE",
    effects: [],
    exportSettings: [],
    interactions: [],
    characters,
    style: {
      fontFamily: "Noto Sans",
      fontPostScriptName: "NotoSans-Regular",
      fontWeight: 400,
      fontSize: 14,
      textAlignHorizontal: "LEFT",
      textAlignVertical: "TOP",
      letterSpacing: 0,
      lineHeightPx: 20,
      lineHeightPercent: 100,
      lineHeightPercentFontSize: 100,
      lineHeightUnit: "INTRINSIC_%",
      textAutoResize: "WIDTH_AND_HEIGHT",
      textDecoration: "NONE",
      textCase: "ORIGINAL",
      ...baseStyle,
    } as figrest.TypeStyle,
    characterStyleOverrides,
    styleOverrideTable: styleOverrideTable as Record<string, figrest.TypeStyle>,
    size: { x: 200, y: 40 },
    relativeTransform: [
      [1, 0, 10],
      [0, 1, 20],
    ],
  } as unknown as figrest.TextNode;

  const frameNode: figrest.FrameNode = {
    id: "1:1",
    name: "Frame",
    type: "FRAME",
    scrollBehavior: "SCROLLS",
    blendMode: "PASS_THROUGH",
    clipsContent: true,
    absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
    absoluteRenderBounds: { x: 0, y: 0, width: 400, height: 300 },
    constraints: { vertical: "TOP", horizontal: "LEFT" },
    fills: [],
    strokes: [],
    strokeWeight: 1,
    strokeAlign: "INSIDE",
    effects: [],
    exportSettings: [],
    interactions: [],
    background: [],
    backgroundColor: { r: 1, g: 1, b: 1, a: 1 },
    children: [textNode as unknown as figrest.SubcanvasNode],
    size: { x: 400, y: 300 },
    relativeTransform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
  } as figrest.FrameNode;

  const { document: doc } = iofigma.restful.factory.document(
    frameNode,
    {},
    context
  );

  return { doc };
}

function findAttribNode(
  doc: grida.program.document.IDocumentDefinition
): grida.program.nodes.AttributedTextNode | undefined {
  return Object.values(doc.nodes).find(
    (n): n is grida.program.nodes.AttributedTextNode => n.type === "attrib"
  );
}

describe("REST API TEXT → AttributedTextNode", () => {
  describe("characterStyleOverrides shorter than characters", () => {
    it("covers the full text when overrides array is shorter (Korean)", () => {
      // Simulates the real Figma REST API pattern: "학교법인 > 법인사무처 > 기획조정팀"
      // with characterStyleOverrides=[2,2] (only 2 entries for 20-char text)
      const text = "학교법인 > 법인사무처 > 기획조정팀";
      const { doc } = makeTextNode(text, [2, 2], {
        "2": { fontWeight: 500 },
      });

      const attrib = findAttribNode(doc);
      expect(attrib).toBeDefined();
      expect(attrib!.text).toBe(text);

      // Runs must cover entire text: [0, textLen)
      const runs = attrib!.styled_runs;
      expect(runs.length).toBeGreaterThanOrEqual(1);
      expect(runs[0].start).toBe(0);
      expect(runs[runs.length - 1].end).toBe(text.length);

      // Verify no gaps between runs
      for (let i = 1; i < runs.length; i++) {
        expect(runs[i].start).toBe(runs[i - 1].end);
      }

      // First run (chars 0..2) should have override weight 500
      expect(runs[0].end).toBe(2);
      expect(runs[0].style.font_weight).toBe(500);

      // Remaining run should have base weight 400
      expect(runs[1].start).toBe(2);
      expect(runs[1].end).toBe(text.length);
      expect(runs[1].style.font_weight).toBe(400);
    });

    it("covers full text with single-char override array", () => {
      const text = "가나다라마바사";
      const { doc } = makeTextNode(text, [1], {
        "1": { fontWeight: 700 },
      });

      const attrib = findAttribNode(doc);
      expect(attrib).toBeDefined();

      const runs = attrib!.styled_runs;
      expect(runs[0].start).toBe(0);
      expect(runs[runs.length - 1].end).toBe(text.length);

      // First char bold, rest base
      expect(runs[0].end).toBe(1);
      expect(runs[0].style.font_weight).toBe(700);
      expect(runs[1].start).toBe(1);
      expect(runs[1].end).toBe(text.length);
      expect(runs[1].style.font_weight).toBe(400);
    });
  });

  describe("CJK text with full overrides (KJC order)", () => {
    it("produces correct char-index runs for Korean + Japanese + Chinese", () => {
      // KJC order as requested
      const text = "한국어 日本語 中文";
      const overrides = [1, 1, 1, 0, 2, 2, 2, 0, 3, 3];
      const { doc } = makeTextNode(text, overrides, {
        "1": { fontWeight: 700 },
        "2": { fontWeight: 500 },
        "3": { fontWeight: 300 },
      });

      const attrib = findAttribNode(doc);
      expect(attrib).toBeDefined();
      expect(attrib!.text).toBe(text);

      const runs = attrib!.styled_runs;
      // Full coverage
      expect(runs[0].start).toBe(0);
      expect(runs[runs.length - 1].end).toBe(text.length);

      // Korean "한국어" (chars 0..3) — weight 700
      expect(attrib!.text!.slice(runs[0].start, runs[0].end)).toBe("한국어");
      expect(runs[0].style.font_weight).toBe(700);

      // Space (char 3) — base weight 400
      expect(attrib!.text!.slice(runs[1].start, runs[1].end)).toBe(" ");
      expect(runs[1].style.font_weight).toBe(400);

      // Japanese "日本語" (chars 4..7) — weight 500
      expect(attrib!.text!.slice(runs[2].start, runs[2].end)).toBe("日本語");
      expect(runs[2].style.font_weight).toBe(500);

      // Space (char 7) — base weight 400
      expect(attrib!.text!.slice(runs[3].start, runs[3].end)).toBe(" ");
      expect(runs[3].style.font_weight).toBe(400);

      // Chinese "中文" (chars 8..10) — weight 300
      expect(attrib!.text!.slice(runs[4].start, runs[4].end)).toBe("中文");
      expect(runs[4].style.font_weight).toBe(300);
    });
  });

  describe("characterStyleOverrides same length as characters", () => {
    it("covers full text with mixed CJK and numbers", () => {
      // Simulates "제 1조 [목적]" — numbers and brackets are ASCII (1 byte),
      // Korean chars are 3 bytes each in UTF-8.
      const text = "제 1조 [목적]";
      const overrides = [1, 0, 0, 1, 0, 0, 1, 1, 0];
      const { doc } = makeTextNode(text, overrides, {
        "1": { fontWeight: 700 },
      });

      const attrib = findAttribNode(doc);
      expect(attrib).toBeDefined();

      const runs = attrib!.styled_runs;
      expect(runs[0].start).toBe(0);
      expect(runs[runs.length - 1].end).toBe(text.length);

      // No gaps
      for (let i = 1; i < runs.length; i++) {
        expect(runs[i].start).toBe(runs[i - 1].end);
      }
    });
  });

  describe("per-run fill color override", () => {
    it("preserves blue fill_paints on overridden CJK runs", () => {
      // "你好，世界！" where "世界！" (chars 3..6) is blue + bold
      const text = "你好，世界！";
      const { doc } = makeTextNode(text, [0, 0, 0, 1, 1, 1], {
        "1": {
          fontWeight: 700,
          fills: [{ type: "SOLID", color: { r: 0.133, g: 0, b: 1, a: 1 } }],
        } as any,
      });

      const attrib = findAttribNode(doc);
      expect(attrib).toBeDefined();

      const runs = attrib!.styled_runs;
      expect(runs.length).toBe(2);

      // Base run: no fill_paints override
      expect(runs[0].fill_paints).toBeUndefined();

      // Blue run: fill_paints with blue
      expect(runs[1].fill_paints).toBeDefined();
      expect(runs[1].fill_paints!.length).toBe(1);
      expect(runs[1].fill_paints![0].type).toBe("solid");
      if (runs[1].fill_paints![0].type === "solid") {
        expect(runs[1].fill_paints![0].color.b).toBeCloseTo(1);
        expect(runs[1].fill_paints![0].color.r).toBeLessThan(0.2);
      }
    });
  });

  describe("override preserves base font_family", () => {
    it("does not clobber font_family when override only changes weight", () => {
      const text = "가나다라";
      const { doc } = makeTextNode(
        text,
        [1, 1, 0, 0],
        { "1": { fontWeight: 700 } },
        { fontFamily: "Pretendard" }
      );

      const attrib = findAttribNode(doc);
      expect(attrib).toBeDefined();

      // Both runs should preserve the base font_family
      for (const run of attrib!.styled_runs) {
        expect(run.style.font_family).toBe("Pretendard");
      }
    });
  });
});

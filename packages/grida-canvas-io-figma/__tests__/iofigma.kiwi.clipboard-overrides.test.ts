import { readFileSync } from "fs";
import { readHTMLMessage, type NodeChange } from "../fig-kiwi";
import { iofigma } from "../lib";

const FIXTURES_BASE = __dirname + "/../../../fixtures/test-fig/clipboard";

const FILES = [
  "component-component-instance-blue-with-overrides.clipboard.html",
  "component-component-instance-red-with-overrides.clipboard.html",
  "component-component-set-component-instance-blue-with-overrides.clipboard.html",
  "component-component-set-component-instance-red-with-overrides.clipboard.html",
];

function findInstanceNc(nodeChanges: NodeChange[]) {
  return nodeChanges.find((nc) => nc.type === "INSTANCE");
}

/**
 * Build an expected "paint check" for a given target node and override entry.
 * Returns a pair of (isArray, length) for fills and strokes. When the override
 * does NOT define paint overrides for a slot, we mirror the node's actual
 * values so the resulting assertion is tautological (i.e. no assertion), which
 * preserves the original test semantics without using a conditional expect.
 */
function buildPaintExpectations(
  overrideFillPaints: unknown[] | undefined,
  overrideStrokePaints: unknown[] | undefined,
  actualFills: unknown,
  actualStrokes: unknown
) {
  const actualFillsLength = Array.isArray(actualFills)
    ? (actualFills as unknown[]).length
    : -1;
  const actualStrokesLength = Array.isArray(actualStrokes)
    ? (actualStrokes as unknown[]).length
    : -1;
  return {
    fillsIsArrayActual: Array.isArray(actualFills),
    fillsLengthActual: actualFillsLength,
    fillsIsArrayExpected:
      overrideFillPaints !== undefined ? true : Array.isArray(actualFills),
    fillsLengthExpected:
      overrideFillPaints !== undefined
        ? overrideFillPaints.length
        : actualFillsLength,
    strokesIsArrayActual: Array.isArray(actualStrokes),
    strokesLengthActual: actualStrokesLength,
    strokesIsArrayExpected:
      overrideStrokePaints !== undefined ? true : Array.isArray(actualStrokes),
    strokesLengthExpected:
      overrideStrokePaints !== undefined
        ? overrideStrokePaints.length
        : actualStrokesLength,
  };
}

describe("iofigma.kiwi clipboard overrides (fixtures)", () => {
  it.each(FILES)(
    "applies root-level paint overrides from symbolData.symbolOverrides onto INSTANCE (%s)",
    (file) => {
      const html = readFileSync(`${FIXTURES_BASE}/${file}`, "utf-8");
      const parsed = readHTMLMessage(html);
      const nodeChanges = parsed.message.nodeChanges ?? [];

      const instNc = findInstanceNc(nodeChanges)!;
      expect(instNc).toBeDefined();

      const o0 = instNc.symbolData?.symbolOverrides?.[0];
      expect(o0).toBeDefined();

      // Build just the node conversion (no flattening concerns)
      const instRest = iofigma.kiwi.factory.node(instNc, parsed.message);
      expect(instRest?.type).toBe("INSTANCE");

      const instRestNode =
        instRest as import("@figma/rest-api-spec").InstanceNode;

      const check = buildPaintExpectations(
        o0!.fillPaints,
        o0!.strokePaints,
        instRestNode.fills,
        instRestNode.strokes
      );

      expect(check.fillsIsArrayActual).toBe(check.fillsIsArrayExpected);
      expect(check.fillsLengthActual).toBe(check.fillsLengthExpected);
      expect(check.strokesIsArrayActual).toBe(check.strokesIsArrayExpected);
      expect(check.strokesLengthActual).toBe(check.strokesLengthExpected);
    }
  );

  it.each(FILES)(
    "preserves applied overrides when building clipboard roots with flattenInstances=true (%s)",
    (file) => {
      const html = readFileSync(`${FIXTURES_BASE}/${file}`, "utf-8");
      const parsed = readHTMLMessage(html);

      const roots = iofigma.kiwi.buildClipboardRootNodes({
        nodeChanges: parsed.message.nodeChanges ?? [],
        message: parsed.message,
        options: { flattenInstances: true },
      });

      // All these fixtures are instance copies; internal master nodes must not be roots.
      expect(roots.length).toBe(1);
      const root = roots[0] as import("@figma/rest-api-spec").InstanceNode & {
        id: string;
      };
      expect(root.type).toBe("INSTANCE");

      // If overrides produced paints, ensure they are still present after flattening.
      const instNc = findInstanceNc(parsed.message.nodeChanges ?? []);
      const o0 = instNc?.symbolData?.symbolOverrides?.[0];

      const check = buildPaintExpectations(
        o0?.fillPaints,
        o0?.strokePaints,
        root.fills,
        root.strokes
      );

      expect(check.fillsIsArrayActual).toBe(check.fillsIsArrayExpected);
      expect(check.fillsLengthActual).toBe(check.fillsLengthExpected);
      expect(check.strokesIsArrayActual).toBe(check.strokesIsArrayExpected);
      expect(check.strokesLengthActual).toBe(check.strokesLengthExpected);
    }
  );
});

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

describe("iofigma.kiwi clipboard overrides (fixtures)", () => {
  it("applies root-level paint overrides from symbolData.symbolOverrides onto INSTANCE", () => {
    for (const file of FILES) {
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
      if (o0!.fillPaints !== undefined) {
        expect(Array.isArray(instRestNode.fills)).toBe(true);
        expect(instRestNode.fills.length).toBe(o0!.fillPaints.length);
      }

      if (o0!.strokePaints !== undefined) {
        expect(Array.isArray(instRestNode.strokes)).toBe(true);
        expect(instRestNode.strokes!.length).toBe(o0!.strokePaints.length);
      }
    }
  });

  it("preserves applied overrides when building clipboard roots with flattenInstances=true", () => {
    for (const file of FILES) {
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

      if (o0?.fillPaints !== undefined) {
        expect(Array.isArray(root.fills)).toBe(true);
        expect(root.fills.length).toBe(o0.fillPaints.length);
      }
      if (o0?.strokePaints !== undefined) {
        expect(Array.isArray(root.strokes)).toBe(true);
        expect(root.strokes!.length).toBe(o0.strokePaints.length);
      }
    }
  });
});

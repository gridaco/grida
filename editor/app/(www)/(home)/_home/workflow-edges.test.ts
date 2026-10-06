import { describe, expect, it } from "vitest";
import { WorkflowEdges } from "./workflow-edges";

describe("WorkflowEdges layout", () => {
  const source = { x: 0, y: 100, width: 160, height: 120 };

  it("connects wide layouts at the facing horizontal edges", () => {
    const target = { x: 300, y: 0, width: 200, height: 300 };
    const result = WorkflowEdges.layout(source, target, "direct", 0);
    expect(result.source).toEqual({ x: 160, y: 160, side: "right" });
    expect(result.target).toEqual({ x: 300, y: 150, side: "left" });
  });

  it("switches a desktop branch to bottom-to-top ports when stacked", () => {
    const target = { x: 10, y: 300, width: 140, height: 200 };
    const result = WorkflowEdges.layout(source, target, "above", 20);
    expect(result.source.side).toBe("bottom");
    expect(result.target.side).toBe("top");
    expect(result.source.y).toBe(220);
    expect(result.target.y).toBe(300);
    expect(result.path).not.toContain("Q");
  });

  it("routes a branch above the output into its top edge", () => {
    const target = { x: 600, y: 60, width: 160, height: 300 };
    const result = WorkflowEdges.layout(source, target, "above", 30);
    expect(result.target).toEqual({ x: 680, y: 60, side: "top" });
    expect(result.path).toContain("Q");
    expect(result.path).toContain("30");
    expect(result.path).toMatch(/L 680 60$/);
  });

  it("supports flows positioned to the left and above the source", () => {
    const rightSource = { ...source, x: 400 };
    expect(
      WorkflowEdges.layout(rightSource, source, "direct", 0).source.side
    ).toBe("left");
    const above = { ...source, y: -200 };
    expect(WorkflowEdges.layout(source, above, "direct", 0).source.side).toBe(
      "top"
    );
  });
});

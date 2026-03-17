import { describe, it, expect } from "vitest";
import iosvg from "../index";
import type { svgtypes } from "../lib";

// ---------------------------------------------------------------------------
// Helpers — build IR nodes in the shape WASM would produce
// ---------------------------------------------------------------------------

const identity: svgtypes.Transform2D = [
  [1, 0, 0],
  [0, 1, 0],
];

function translate(x: number, y: number): svgtypes.Transform2D {
  return [
    [1, 0, x],
    [0, 1, y],
  ];
}

function solidFill(
  r: number,
  g: number,
  b: number,
  a = 255
): svgtypes.SVGFillAttributes {
  return {
    paint: { kind: "solid", color: [r, g, b, a] },
    fill_opacity: 1.0,
    fill_rule: "nonzero",
  };
}

function solidStroke(
  r: number,
  g: number,
  b: number,
  width = 1
): svgtypes.SVGStrokeAttributes {
  return {
    paint: { kind: "solid", color: [r, g, b, 255] },
    stroke_width: width,
    stroke_linecap: "butt",
    stroke_linejoin: "miter",
    stroke_miterlimit: 4,
    stroke_dasharray: null,
    stroke_opacity: 1.0,
  };
}

// ---------------------------------------------------------------------------
// convert() — root container
// ---------------------------------------------------------------------------

describe("iosvg.convert", () => {
  it("returns a container node for an empty SVG", () => {
    const ir: svgtypes.ir.IRSVGInitialContainerNode = {
      width: 100,
      height: 100,
      children: [],
    };
    const result = iosvg.convert(ir);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("container");
    expect(result!).toHaveProperty("layout_target_width", 100);
    expect(result!).toHaveProperty("layout_target_height", 100);
  });

  it("uses context name when provided", () => {
    const ir: svgtypes.ir.IRSVGInitialContainerNode = {
      width: 24,
      height: 24,
      children: [],
    };
    const result = iosvg.convert(ir, { name: "icon" });
    expect(result).not.toBeNull();
    expect((result as any).name).toBe("icon");
  });

  // -------------------------------------------------------------------------
  // path nodes
  // -------------------------------------------------------------------------

  it("converts a single path node to a vector", () => {
    const ir: svgtypes.ir.IRSVGInitialContainerNode = {
      width: 100,
      height: 100,
      children: [
        {
          kind: "path",
          transform: identity,
          fill: solidFill(255, 0, 0),
          stroke: null,
          d: "M0 0 L100 0 L100 100 L0 100 Z",
        },
      ],
    };
    const result = iosvg.convert(ir);
    expect(result).not.toBeNull();
    const children = (result as any).children;
    expect(children).toHaveLength(1);
    expect(children[0].type).toBe("vector");
    expect(children[0].vector_network).toBeDefined();
    expect(children[0].fill).toBeDefined();
    expect(children[0].fill.type).toBe("solid");
  });

  it("converts path with stroke attributes", () => {
    const ir: svgtypes.ir.IRSVGInitialContainerNode = {
      width: 200,
      height: 200,
      children: [
        {
          kind: "path",
          transform: identity,
          fill: null,
          stroke: solidStroke(0, 0, 0, 2),
          d: "M10 10 L190 10",
        },
      ],
    };
    const result = iosvg.convert(ir);
    const children = (result as any).children;
    expect(children).toHaveLength(1);
    expect(children[0].stroke).toBeDefined();
    expect(children[0].stroke.type).toBe("solid");
    expect(children[0].stroke_width).toBe(2);
  });

  it("extracts position from path transform", () => {
    const ir: svgtypes.ir.IRSVGInitialContainerNode = {
      width: 200,
      height: 200,
      children: [
        {
          kind: "path",
          transform: translate(50, 75),
          fill: solidFill(0, 0, 255),
          stroke: null,
          d: "M0 0 L40 0 L40 40 L0 40 Z",
        },
      ],
    };
    const result = iosvg.convert(ir);
    const child = (result as any).children[0];
    expect(child.layout_inset_left).toBe(50);
    expect(child.layout_inset_top).toBe(75);
  });

  // -------------------------------------------------------------------------
  // group nodes
  // -------------------------------------------------------------------------

  it("converts group nodes with children", () => {
    const ir: svgtypes.ir.IRSVGInitialContainerNode = {
      width: 300,
      height: 300,
      children: [
        {
          kind: "group",
          transform: translate(10, 20),
          opacity: 0.5,
          blend_mode: "normal",
          children: [
            {
              kind: "path",
              transform: identity,
              fill: solidFill(255, 0, 0),
              stroke: null,
              d: "M0 0 L50 0 L50 50 L0 50 Z",
            },
            {
              kind: "path",
              transform: identity,
              fill: solidFill(0, 255, 0),
              stroke: null,
              d: "M60 0 L110 0 L110 50 L60 50 Z",
            },
          ],
        },
      ],
    };
    const result = iosvg.convert(ir);
    const group = (result as any).children[0];
    expect(group.type).toBe("group");
    expect(group.opacity).toBe(0.5);
    expect(group.layout_inset_left).toBe(10);
    expect(group.layout_inset_top).toBe(20);
    expect(group.children).toHaveLength(2);
    expect(group.children[0].type).toBe("vector");
    expect(group.children[1].type).toBe("vector");
  });

  it("handles deeply nested groups", () => {
    const ir: svgtypes.ir.IRSVGInitialContainerNode = {
      width: 100,
      height: 100,
      children: [
        {
          kind: "group",
          transform: identity,
          opacity: 1.0,
          blend_mode: "normal",
          children: [
            {
              kind: "group",
              transform: identity,
              opacity: 0.8,
              blend_mode: "normal",
              children: [
                {
                  kind: "group",
                  transform: identity,
                  opacity: 0.6,
                  blend_mode: "normal",
                  children: [
                    {
                      kind: "path",
                      transform: identity,
                      fill: solidFill(0, 0, 0),
                      stroke: null,
                      d: "M0 0 L10 0 L10 10 L0 10 Z",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = iosvg.convert(ir);
    const g1 = (result as any).children[0];
    const g2 = g1.children[0];
    const g3 = g2.children[0];
    expect(g3.children[0].type).toBe("vector");
  });

  // -------------------------------------------------------------------------
  // text and image nodes — currently silently skipped
  // -------------------------------------------------------------------------

  it("converts single-span text to tspan prototype", () => {
    const ir: svgtypes.ir.IRSVGInitialContainerNode = {
      width: 200,
      height: 200,
      children: [
        {
          kind: "text",
          transform: translate(10, 40),
          text_content: "Hello",
          fill: solidFill(0, 0, 0),
          stroke: null,
          spans: [
            {
              transform: translate(10, 40),
              text: "Hello",
              fill: solidFill(0, 0, 0),
              stroke: null,
              font_size: 24,
              anchor: "start" as svgtypes.SVGTextAnchor,
            },
          ],
          bounds: { x: 10, y: 20, width: 120, height: 30 },
        },
      ],
    };
    const result = iosvg.convert(ir);
    expect((result as any).children).toHaveLength(1);
    const textNode = (result as any).children[0];
    expect(textNode.type).toBe("tspan");
    expect(textNode.text).toBe("Hello");
    expect(textNode.font_size).toBe(24);
    expect(textNode.fill).toBeDefined();
    expect(textNode.fill.type).toBe("solid");
  });

  it("converts multi-span text to group with tspan children", () => {
    const ir: svgtypes.ir.IRSVGInitialContainerNode = {
      width: 400,
      height: 400,
      children: [
        {
          kind: "text",
          transform: translate(0, 0),
          text_content: "Line 1Line 2Line 3",
          fill: solidFill(0, 0, 0),
          stroke: null,
          spans: [
            {
              transform: translate(10, 30),
              text: "Line 1",
              fill: solidFill(0, 0, 0),
              stroke: null,
              font_size: 20,
              anchor: "start" as svgtypes.SVGTextAnchor,
            },
            {
              transform: translate(10, 54),
              text: "Line 2",
              fill: solidFill(255, 0, 0),
              stroke: null,
              font_size: 20,
              anchor: "start" as svgtypes.SVGTextAnchor,
            },
            {
              transform: translate(10, 78),
              text: "Line 3",
              fill: solidFill(0, 0, 255),
              stroke: null,
              font_size: 20,
              anchor: "start" as svgtypes.SVGTextAnchor,
            },
          ],
          bounds: { x: 10, y: 10, width: 200, height: 80 },
        },
      ],
    };
    const result = iosvg.convert(ir);
    const group = (result as any).children[0];
    expect(group.type).toBe("group");
    expect(group.children).toHaveLength(3);
    expect(group.children[0].type).toBe("tspan");
    expect(group.children[0].text).toBe("Line 1");
    expect(group.children[1].text).toBe("Line 2");
    expect(group.children[2].text).toBe("Line 3");
    // Each child should have its own position
    expect(group.children[0].layout_inset_top).toBe(30);
    expect(group.children[1].layout_inset_top).toBe(54);
    expect(group.children[2].layout_inset_top).toBe(78);
  });

  it("converts text node with default font size when spans are empty", () => {
    const ir: svgtypes.ir.IRSVGInitialContainerNode = {
      width: 200,
      height: 200,
      children: [
        {
          kind: "text",
          transform: identity,
          text_content: "No spans",
          fill: solidFill(0, 0, 0),
          stroke: null,
          spans: [],
          bounds: { x: 0, y: 0, width: 80, height: 20 },
        },
      ],
    };
    const result = iosvg.convert(ir);
    expect((result as any).children).toHaveLength(1);
    const textNode = (result as any).children[0];
    expect(textNode.type).toBe("tspan");
    expect(textNode.text).toBe("No spans");
    expect(textNode.font_size).toBe(16);
    // Text nodes auto-size — no explicit width/height
    expect(textNode.layout_target_width).toBeUndefined();
    expect(textNode.layout_target_height).toBeUndefined();
  });

  it("skips image nodes (returns null, filtered out)", () => {
    const ir: svgtypes.ir.IRSVGInitialContainerNode = {
      width: 200,
      height: 200,
      children: [
        {
          kind: "image",
        } as svgtypes.ir.IRSVGImageNode,
      ],
    };
    const result = iosvg.convert(ir);
    expect((result as any).children).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // paint conversion
  // -------------------------------------------------------------------------

  it("converts solid fill color from RGBA8888 to RGBA32F", () => {
    const ir: svgtypes.ir.IRSVGInitialContainerNode = {
      width: 100,
      height: 100,
      children: [
        {
          kind: "path",
          transform: identity,
          fill: solidFill(255, 128, 0, 255),
          stroke: null,
          d: "M0 0 L100 0 L100 100 L0 100 Z",
        },
      ],
    };
    const result = iosvg.convert(ir);
    const fill = (result as any).children[0].fill;
    expect(fill.type).toBe("solid");
    expect(fill.color.r).toBeCloseTo(1.0, 1);
    expect(fill.color.g).toBeCloseTo(128 / 255, 1);
    expect(fill.color.b).toBeCloseTo(0.0, 1);
    expect(fill.color.a).toBeCloseTo(1.0, 1);
  });

  it("converts linear gradient fill", () => {
    const ir: svgtypes.ir.IRSVGInitialContainerNode = {
      width: 100,
      height: 100,
      children: [
        {
          kind: "path",
          transform: identity,
          fill: {
            paint: {
              kind: "linear-gradient",
              id: "lg1",
              x1: 0,
              y1: 0,
              x2: 1,
              y2: 0,
              transform: identity,
              stops: [
                { color: [255, 0, 0, 255], offset: 0 },
                { color: [0, 0, 255, 255], offset: 1 },
              ],
              spread_method: "pad" as svgtypes.SVGSpreadMethod,
            },
            fill_opacity: 1.0,
            fill_rule: "nonzero",
          },
          stroke: null,
          d: "M0 0 L100 0 L100 100 L0 100 Z",
        },
      ],
    };
    const result = iosvg.convert(ir);
    const fill = (result as any).children[0].fill;
    expect(fill.type).toBe("linear_gradient");
    expect(fill.stops).toHaveLength(2);
    expect(fill.stops[0].color.r).toBeCloseTo(1.0, 1);
    expect(fill.stops[1].color.b).toBeCloseTo(1.0, 1);
  });

  it("converts radial gradient fill", () => {
    const ir: svgtypes.ir.IRSVGInitialContainerNode = {
      width: 100,
      height: 100,
      children: [
        {
          kind: "path",
          transform: identity,
          fill: {
            paint: {
              kind: "radial-gradient",
              id: "rg1",
              cx: 0.5,
              cy: 0.5,
              r: 0.5,
              fx: 0.5,
              fy: 0.5,
              transform: identity,
              stops: [
                { color: [255, 255, 255, 255], offset: 0 },
                { color: [0, 0, 0, 255], offset: 1 },
              ],
              spread_method: "pad" as svgtypes.SVGSpreadMethod,
            },
            fill_opacity: 0.8,
            fill_rule: "evenodd",
          },
          stroke: null,
          d: "M0 0 L100 0 L100 100 L0 100 Z",
        },
      ],
    };
    const result = iosvg.convert(ir);
    const fill = (result as any).children[0].fill;
    expect(fill.type).toBe("radial_gradient");
    expect(fill.stops).toHaveLength(2);
    expect(fill.opacity).toBe(0.8);
    const child = (result as any).children[0];
    expect(child.fill_rule).toBe("evenodd");
  });

  // -------------------------------------------------------------------------
  // complex scene — multiple node types mixed
  // -------------------------------------------------------------------------

  it("converts a complex scene with mixed node types", () => {
    const ir: svgtypes.ir.IRSVGInitialContainerNode = {
      width: 512,
      height: 512,
      children: [
        {
          kind: "group",
          transform: identity,
          opacity: 1.0,
          blend_mode: "normal",
          children: [
            {
              kind: "path",
              transform: identity,
              fill: solidFill(26, 26, 46),
              stroke: null,
              d: "M0 0 L512 0 L512 512 L0 512 Z",
            },
            {
              kind: "path",
              transform: translate(256, 200),
              fill: solidFill(233, 69, 96),
              stroke: null,
              d: "M0 -120 A120 120 0 1 1 0 120 A120 120 0 1 1 0 -120 Z",
            },
            // text — now converted to tspan
            {
              kind: "text",
              transform: translate(256, 400),
              text_content: "BRAND",
              fill: solidFill(255, 255, 255),
              stroke: null,
              spans: [],
              bounds: { x: 0, y: 0, width: 200, height: 48 },
            },
            // image — should be filtered out
            {
              kind: "image",
            } as svgtypes.ir.IRSVGImageNode,
          ],
        },
      ],
    };
    const result = iosvg.convert(ir);
    expect(result).not.toBeNull();
    const topGroup = (result as any).children[0];
    expect(topGroup.type).toBe("group");
    // 2 paths + 1 text survive, only image filtered out
    expect(topGroup.children).toHaveLength(3);
    expect(topGroup.children[0].type).toBe("vector");
    expect(topGroup.children[1].type).toBe("vector");
    expect(topGroup.children[2].type).toBe("tspan");
  });

  // -------------------------------------------------------------------------
  // edge cases
  // -------------------------------------------------------------------------

  it("handles path with both fill and stroke", () => {
    const ir: svgtypes.ir.IRSVGInitialContainerNode = {
      width: 100,
      height: 100,
      children: [
        {
          kind: "path",
          transform: identity,
          fill: solidFill(255, 0, 0),
          stroke: solidStroke(0, 0, 0, 3),
          d: "M10 10 L90 10 L90 90 L10 90 Z",
        },
      ],
    };
    const result = iosvg.convert(ir);
    const child = (result as any).children[0];
    expect(child.fill).toBeDefined();
    expect(child.stroke).toBeDefined();
    expect(child.stroke_width).toBe(3);
  });

  it("handles null paint gracefully", () => {
    const ir: svgtypes.ir.IRSVGInitialContainerNode = {
      width: 100,
      height: 100,
      children: [
        {
          kind: "path",
          transform: identity,
          fill: null,
          stroke: null,
          d: "M0 0 L100 100",
        },
      ],
    };
    const result = iosvg.convert(ir);
    const child = (result as any).children[0];
    expect(child.type).toBe("vector");
    expect(child.fill).toBeUndefined();
    expect(child.stroke).toBeUndefined();
  });

  it("handles stroke with dasharray", () => {
    const ir: svgtypes.ir.IRSVGInitialContainerNode = {
      width: 100,
      height: 100,
      children: [
        {
          kind: "path",
          transform: identity,
          fill: null,
          stroke: {
            paint: { kind: "solid", color: [0, 0, 0, 255] },
            stroke_width: 2,
            stroke_linecap: "round",
            stroke_linejoin: "round",
            stroke_miterlimit: 4,
            stroke_dasharray: [10, 5, 2, 5],
            stroke_opacity: 1.0,
          },
          d: "M10 50 L190 50",
        },
      ],
    };
    const result = iosvg.convert(ir);
    const child = (result as any).children[0];
    expect(child.stroke_cap).toBe("round");
    expect(child.stroke_join).toBe("round");
    expect(child.stroke_dash_array).toEqual([10, 5, 2, 5]);
  });
});

// ---------------------------------------------------------------------------
// map helpers — unit tests
// ---------------------------------------------------------------------------

describe("iosvg.map.extractTranslation", () => {
  it("returns zero for identity", () => {
    const pos = iosvg.map.extractTranslation(identity);
    expect(pos.left).toBe(0);
    expect(pos.top).toBe(0);
  });

  it("extracts tx, ty from transform matrix", () => {
    const pos = iosvg.map.extractTranslation(translate(42, 99));
    expect(pos.left).toBe(42);
    expect(pos.top).toBe(99);
  });
});

describe("iosvg.map.paint", () => {
  it("returns undefined for null paint", () => {
    expect(iosvg.map.paint(null)).toBeUndefined();
    expect(iosvg.map.paint(undefined)).toBeUndefined();
  });

  it("converts solid paint", () => {
    const p = iosvg.map.paint(
      { kind: "solid", color: [128, 64, 32, 255] },
      1.0
    );
    expect(p).toBeDefined();
    expect(p!.type).toBe("solid");
  });
});

describe("iosvg.map.fill", () => {
  it("returns defaults for null fill", () => {
    const { paint, fill_rule, opacity } = iosvg.map.fill(null);
    expect(paint).toBeUndefined();
    expect(fill_rule).toBe("nonzero");
    expect(opacity).toBe(1.0);
  });
});

describe("iosvg.map.stroke", () => {
  it("returns defaults for null stroke", () => {
    const s = iosvg.map.stroke(null);
    expect(s.paint).toBeUndefined();
    expect(s.strokeWidth).toBe(0);
    expect(s.strokeCap).toBe("butt");
    expect(s.strokeJoin).toBe("miter");
  });
});

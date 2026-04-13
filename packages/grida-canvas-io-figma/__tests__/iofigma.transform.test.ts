/**
 * Tests for transform mapping correctness between Figma (Kiwi / REST) and Grida.
 *
 * ## Convention summary
 *
 * | Source          | Matrix layout                               | `rotation` field        |
 * |-----------------|---------------------------------------------|-------------------------|
 * | Figma REST/Kiwi | `[[cos θ, sin θ, tx], [-sin θ, cos θ, ty]]` | `atan2(m10, m00)` (rad) |
 * | Grida           | `[[cos φ, -sin φ, tx], [sin φ, cos φ, ty]]` | degrees                 |
 *
 * The off-diagonal signs are opposite. Setting `φ = -θ` makes the matrices
 * identical. So: `grida_deg = figma_rad * 180/π` (which equals `-θ_figma_deg`).
 *
 * For a Figma "45° visual rotation" (CW on screen):
 *   - Figma matrix m10 = -sin(45°) = -0.707
 *   - REST rotation = atan2(-0.707, 0.707) = -π/4 rad ≈ -0.785
 *   - Grida rotation = -0.785 * 180/π = -45°
 *   - Grida `from_box_center(x, y, w, h, -45)` → `[[cos(-45), -sin(-45), ...], [sin(-45), cos(-45), ...]]`
 *     = `[[0.707, 0.707, ...], [-0.707, 0.707, ...]]` — matches Figma's matrix ✓
 */

import { iofigma } from "../lib";
import type * as figrest from "@figma/rest-api-spec";
import type grida from "@grida/schema";

/** Narrow a Kiwi factory result to a node with HasLayoutTrait fields. */
type KiwiLayoutNode = figrest.HasLayoutTrait & { rotation?: number };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const context: iofigma.restful.factory.FactoryContext = {
  gradient_id_generator: () => "grad-1",
  prefer_path_for_geometry: true,
  preserve_figma_ids: true,
};

/** Build a Figma REST FRAME node with full geometry. */
function makeFrameNode(
  overrides: Partial<figrest.FrameNode> = {}
): figrest.FrameNode {
  return {
    id: "1:1",
    name: "TestFrame",
    type: "FRAME",
    scrollBehavior: "SCROLLS",
    blendMode: "PASS_THROUGH",
    clipsContent: true,
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
    absoluteRenderBounds: { x: 0, y: 0, width: 100, height: 50 },
    constraints: { vertical: "TOP", horizontal: "LEFT" },
    fills: [],
    strokes: [],
    strokeWeight: 0,
    strokeAlign: "INSIDE",
    effects: [],
    exportSettings: [],
    interactions: [],
    background: [],
    backgroundColor: { r: 0, g: 0, b: 0, a: 0 },
    children: [],
    size: { x: 100, y: 50 },
    relativeTransform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
    ...overrides,
  } as figrest.FrameNode;
}

/** Build a Figma REST RECTANGLE node. */
function makeRectangleNode(
  overrides: Partial<figrest.RectangleNode> = {}
): figrest.RectangleNode {
  return {
    id: "2:1",
    name: "TestRect",
    type: "RECTANGLE",
    scrollBehavior: "SCROLLS",
    blendMode: "PASS_THROUGH",
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
    absoluteRenderBounds: { x: 0, y: 0, width: 100, height: 100 },
    constraints: { vertical: "TOP", horizontal: "LEFT" },
    fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }],
    strokes: [],
    strokeWeight: 0,
    strokeAlign: "INSIDE",
    effects: [],
    exportSettings: [],
    interactions: [],
    cornerRadius: 0,
    rectangleCornerRadii: [0, 0, 0, 0],
    size: { x: 100, y: 100 },
    relativeTransform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
    ...overrides,
  } as figrest.RectangleNode;
}

/**
 * Build a Figma relativeTransform for a given **Figma visual angle** (degrees, CW positive).
 * Convention: [[cos(θ), sin(θ), tx], [-sin(θ), cos(θ), ty]]
 */
function figmaRotationMatrix(
  figmaDegrees: number,
  tx = 0,
  ty = 0
): [[number, number, number], [number, number, number]] {
  const rad = (figmaDegrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [
    [c, s, tx],
    [-s, c, ty],
  ];
}

/**
 * Compute the Figma REST API `rotation` value for a given visual angle.
 * REST rotation = atan2(m10, m00) where m10 = -sin(θ), m00 = cos(θ).
 * Returns radians.
 */
function figmaRestRotation(figmaDegrees: number): number {
  const rad = (figmaDegrees * Math.PI) / 180;
  return Math.atan2(-Math.sin(rad), Math.cos(rad));
}

/**
 * Build a Kiwi-style Matrix from Figma visual angle (degrees) + translation.
 * Same matrix layout as Figma's relativeTransform.
 */
function kiwiMatrix(figmaDegrees: number, tx = 0, ty = 0) {
  const rad = (figmaDegrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { m00: c, m01: s, m02: tx, m10: -s, m11: c, m12: ty };
}

/**
 * Expected Grida rotation (degrees) for a given Figma visual angle.
 * grida_deg = figma_rest_rotation (rad) * 180/π = -figma_visual_deg
 */
function expectedGridaRotation(figmaDegrees: number): number {
  return (figmaRestRotation(figmaDegrees) * 180) / Math.PI;
}

/** Extract the Grida container node from a factory result. */
function getContainer(
  result: ReturnType<typeof iofigma.restful.factory.document>
): grida.program.nodes.ContainerNode {
  return Object.values(result.document.nodes).find(
    (n): n is grida.program.nodes.ContainerNode => n.type === "container"
  )!;
}

/** Extract a group node from a factory result. */
function getGroup(
  result: ReturnType<typeof iofigma.restful.factory.document>
): grida.program.nodes.GroupNode {
  return Object.values(result.document.nodes).find(
    (n): n is grida.program.nodes.GroupNode => n.type === "group"
  )!;
}

// ---------------------------------------------------------------------------
// Tests: Kiwi → REST rotation extraction
// ---------------------------------------------------------------------------

describe("Kiwi → REST: rotation extraction from matrix", () => {
  /**
   * extractRotationFromMatrix produces the same value as the Figma REST API
   * `rotation` field: `atan2(m10, m00)` in **radians**.
   * For a Figma visual angle θ, the REST rotation = -θ (in radians).
   */

  function kiwiNodeRotation(figmaDegrees: number): number {
    const matrix = kiwiMatrix(figmaDegrees, 50, 100);
    const nc = {
      guid: { sessionID: 1, localID: 1 },
      name: "TestRect",
      type: "RECTANGLE" as const,
      visible: true,
      size: { x: 100, y: 50 },
      transform: matrix,
      fillPaints: [],
      strokePaints: [],
    };
    const node = iofigma.kiwi.factory.node(
      nc as any,
      {
        nodeChanges: [],
      } as any
    );
    // node.rotation is the intermediate REST-format value (radians)
    return node!.rotation!;
  }

  it("0° → rotation=0 rad", () => {
    expect(kiwiNodeRotation(0)).toBeCloseTo(0, 5);
  });

  it("45° visual → rotation matches REST convention", () => {
    expect(kiwiNodeRotation(45)).toBeCloseTo(figmaRestRotation(45), 5);
  });

  it("90° visual → rotation matches REST convention", () => {
    expect(kiwiNodeRotation(90)).toBeCloseTo(figmaRestRotation(90), 5);
  });

  it("-45° visual → rotation matches REST convention", () => {
    expect(kiwiNodeRotation(-45)).toBeCloseTo(figmaRestRotation(-45), 5);
  });

  it("-90° visual → rotation matches REST convention", () => {
    expect(kiwiNodeRotation(-90)).toBeCloseTo(figmaRestRotation(-90), 5);
  });

  it("180° visual → rotation matches REST convention", () => {
    // atan2 can return ±π for 180°
    expect(Math.abs(kiwiNodeRotation(180))).toBeCloseTo(Math.PI, 3);
  });

  it("30° visual → rotation matches REST convention", () => {
    expect(kiwiNodeRotation(30)).toBeCloseTo(figmaRestRotation(30), 5);
  });
});

// ---------------------------------------------------------------------------
// Tests: Kiwi layout trait → relativeTransform + absoluteBoundingBox
// ---------------------------------------------------------------------------

describe("Kiwi → REST: kiwi_layout_trait", () => {
  it("identity transform → relativeTransform is identity, AABB = (tx,ty,w,h)", () => {
    const nc = {
      guid: { sessionID: 1, localID: 2 },
      name: "Rect",
      type: "RECTANGLE" as const,
      visible: true,
      size: { x: 200, y: 100 },
      transform: kiwiMatrix(0, 10, 20),
      fillPaints: [],
      strokePaints: [],
    };
    const node = iofigma.kiwi.factory.node(
      nc as any,
      {
        nodeChanges: [],
      } as any
    );
    expect(node).toBeDefined();
    const n = node as KiwiLayoutNode;
    expect(n.size).toEqual({ x: 200, y: 100 });
    expect(n.relativeTransform![0][2]).toBeCloseTo(10, 5);
    expect(n.relativeTransform![1][2]).toBeCloseTo(20, 5);
    expect(n.absoluteBoundingBox!.x).toBeCloseTo(10, 5);
    expect(n.absoluteBoundingBox!.y).toBeCloseTo(20, 5);
    expect(n.absoluteBoundingBox!.width).toBeCloseTo(200, 5);
    expect(n.absoluteBoundingBox!.height).toBeCloseTo(100, 5);
  });

  it("90° rotation → AABB is swapped width/height", () => {
    const nc = {
      guid: { sessionID: 1, localID: 3 },
      name: "Rect",
      type: "RECTANGLE" as const,
      visible: true,
      size: { x: 200, y: 100 },
      transform: kiwiMatrix(90, 0, 0),
      fillPaints: [],
      strokePaints: [],
    };
    const node = iofigma.kiwi.factory.node(
      nc as any,
      {
        nodeChanges: [],
      } as any
    );
    expect((node as KiwiLayoutNode).absoluteBoundingBox!.width).toBeCloseTo(
      100,
      1
    );
    expect((node as KiwiLayoutNode).absoluteBoundingBox!.height).toBeCloseTo(
      200,
      1
    );
  });

  it("45° rotation → AABB encloses rotated rect", () => {
    const nc = {
      guid: { sessionID: 1, localID: 4 },
      name: "Rect45",
      type: "RECTANGLE" as const,
      visible: true,
      size: { x: 100, y: 50 },
      transform: kiwiMatrix(45, 0, 0),
      fillPaints: [],
      strokePaints: [],
    };
    const node = iofigma.kiwi.factory.node(
      nc as any,
      {
        nodeChanges: [],
      } as any
    );
    const rad = (45 * Math.PI) / 180;
    const expectedW =
      Math.abs(100 * Math.cos(rad)) + Math.abs(50 * Math.sin(rad));
    const expectedH =
      Math.abs(100 * Math.sin(rad)) + Math.abs(50 * Math.cos(rad));
    expect((node as KiwiLayoutNode).absoluteBoundingBox!.width).toBeCloseTo(
      expectedW,
      1
    );
    expect((node as KiwiLayoutNode).absoluteBoundingBox!.height).toBeCloseTo(
      expectedH,
      1
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: REST → Grida: rotation conversion (radians → degrees)
// ---------------------------------------------------------------------------

describe("REST → Grida: rotation conversion", () => {
  it("0 radians → 0 degrees", () => {
    const frame = makeFrameNode({ rotation: 0 });
    const result = iofigma.restful.factory.document(frame, {}, context);
    const container = getContainer(result);
    expect(container.rotation).toBe(0);
  });

  it("REST rotation for 45° visual → correct Grida degrees", () => {
    const restRot = figmaRestRotation(45); // ≈ -0.785 rad
    const frame = makeFrameNode({
      rotation: restRot,
      relativeTransform: figmaRotationMatrix(45),
    });
    const result = iofigma.restful.factory.document(frame, {}, context);
    const container = getContainer(result);
    expect(container.rotation).toBeCloseTo(expectedGridaRotation(45), 3);
  });

  it("REST rotation for -90° visual → correct Grida degrees", () => {
    const restRot = figmaRestRotation(-90);
    const frame = makeFrameNode({
      rotation: restRot,
      relativeTransform: figmaRotationMatrix(-90),
    });
    const result = iofigma.restful.factory.document(frame, {}, context);
    const container = getContainer(result);
    expect(container.rotation).toBeCloseTo(expectedGridaRotation(-90), 3);
  });

  it("GROUP with REST rotation → correct Grida degrees", () => {
    const restRot = figmaRestRotation(30);
    const group: figrest.GroupNode = {
      id: "3:1",
      name: "TestGroup",
      type: "GROUP",
      scrollBehavior: "SCROLLS",
      blendMode: "PASS_THROUGH",
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
      absoluteRenderBounds: { x: 0, y: 0, width: 100, height: 100 },
      effects: [],
      exportSettings: [],
      interactions: [],
      children: [],
      rotation: restRot,
      size: { x: 100, y: 100 },
      relativeTransform: figmaRotationMatrix(30),
    } as figrest.GroupNode;

    const result = iofigma.restful.factory.document(group, {}, context);
    const groupNode = getGroup(result);
    // GroupNode's TS type doesn't include `rotation` (it's stored in the
    // Rust-side `transform` field), but base_node_trait spreads it onto the
    // JSON object for the Rust loader. Verify via runtime access.
    const rotationValue = (groupNode as unknown as { rotation: number })
      .rotation;
    expect(rotationValue).toBeCloseTo(expectedGridaRotation(30), 3);
  });
});

// ---------------------------------------------------------------------------
// Tests: REST → Grida: position from relativeTransform
// ---------------------------------------------------------------------------

describe("REST → Grida: position from relativeTransform", () => {
  it("identity transform at (50, 100) → insets = (50, 100)", () => {
    const frame = makeFrameNode({
      relativeTransform: [
        [1, 0, 50],
        [0, 1, 100],
      ],
    });
    const result = iofigma.restful.factory.document(frame, {}, context);
    const container = getContainer(result);
    expect(container.layout_inset_left).toBe(50);
    expect(container.layout_inset_top).toBe(100);
  });

  it("rotated transform extracts tx, ty from matrix", () => {
    const restRot = figmaRestRotation(45);
    const rt = figmaRotationMatrix(45, 75, 150);
    const frame = makeFrameNode({ relativeTransform: rt, rotation: restRot });
    const result = iofigma.restful.factory.document(frame, {}, context);
    const container = getContainer(result);
    expect(container.layout_inset_left).toBeCloseTo(75, 5);
    expect(container.layout_inset_top).toBeCloseTo(150, 5);
  });
});

// ---------------------------------------------------------------------------
// Tests: Kiwi → REST → Grida: end-to-end rotation alignment
// ---------------------------------------------------------------------------

describe("Kiwi → REST → Grida: end-to-end rotation alignment", () => {
  /**
   * The critical invariant: a Figma node with visual rotation θ must produce
   * the same Grida `rotation` value whether imported via Kiwi (matrix) or
   * REST (rotation field).
   */

  function kiwiToGridaRotation(figmaDegrees: number): number {
    const matrix = kiwiMatrix(figmaDegrees, 0, 0);
    const nc = {
      guid: { sessionID: 1, localID: 100 },
      name: "Frame",
      type: "FRAME" as const,
      visible: true,
      size: { x: 100, y: 100 },
      transform: matrix,
      fillPaints: [],
      strokePaints: [],
      frameMaskDisabled: true,
    };
    const restNode = iofigma.kiwi.factory.node(
      nc as any,
      {
        nodeChanges: [],
      } as any
    );
    if (!restNode) throw new Error("Kiwi factory returned undefined");

    const result = iofigma.restful.factory.document(restNode, {}, context);
    const container = getContainer(result);
    return container.rotation;
  }

  function restToGridaRotation(figmaDegrees: number): number {
    const restRot = figmaRestRotation(figmaDegrees);
    const frame = makeFrameNode({
      rotation: restRot,
      relativeTransform: figmaRotationMatrix(figmaDegrees),
    });
    const result = iofigma.restful.factory.document(frame, {}, context);
    const container = getContainer(result);
    return container.rotation;
  }

  const testAngles = [
    0, 15, 30, 45, 60, 90, 120, 135, 150, 180, -15, -30, -45, -60, -90, -120,
    -135, -150, -180,
  ];

  for (const angle of testAngles) {
    it(`${angle}° visual: Kiwi path matches REST path`, () => {
      const kiwiResult = kiwiToGridaRotation(angle);
      const restResult = restToGridaRotation(angle);
      expect(kiwiResult).toBeCloseTo(restResult, 3);
    });
  }

  for (const angle of testAngles) {
    it(`${angle}° visual: Grida rotation equals expected`, () => {
      const result = kiwiToGridaRotation(angle);
      expect(result).toBeCloseTo(expectedGridaRotation(angle), 3);
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: Container with non-identity 2×2 propagation
// ---------------------------------------------------------------------------

describe("Container transform propagation (non-identity 2×2)", () => {
  it("horizontally flipped container bakes flip into children", () => {
    const childRect = makeRectangleNode({
      id: "2:1",
      name: "Child",
      size: { x: 50, y: 50 },
      relativeTransform: [
        [1, 0, 10],
        [0, 1, 20],
      ],
    });

    const parentFrame = makeFrameNode({
      id: "1:1",
      name: "FlippedFrame",
      size: { x: 200, y: 100 },
      relativeTransform: [
        [-1, 0, 300],
        [0, 1, 50],
      ],
      rotation: 0,
      children: [childRect as any],
    });

    const result = iofigma.restful.factory.document(parentFrame, {}, context);
    const container = getContainer(result);

    expect(container.rotation).toBe(0);
    expect(container.layout_inset_left).toBeCloseTo(100, 1);
    expect(container.layout_inset_top).toBeCloseTo(50, 1);
    expect(container.layout_target_width).toBeCloseTo(200, 1);
    expect(container.layout_target_height).toBeCloseTo(100, 1);
  });

  it("rotated container propagates 2×2 into children", () => {
    const childRect = makeRectangleNode({
      id: "2:1",
      name: "Child",
      size: { x: 40, y: 30 },
      relativeTransform: [
        [1, 0, 5],
        [0, 1, 10],
      ],
    });

    const rt90 = figmaRotationMatrix(90, 200, 50);
    const parentFrame = makeFrameNode({
      id: "1:1",
      name: "RotatedFrame",
      size: { x: 100, y: 80 },
      relativeTransform: rt90,
      rotation: figmaRestRotation(90),
      children: [childRect as any],
    });

    const result = iofigma.restful.factory.document(parentFrame, {}, context);
    const container = getContainer(result);

    expect(container.rotation).toBe(0);
    expect(container.layout_target_width).toBeCloseTo(80, 1);
    expect(container.layout_target_height).toBeCloseTo(100, 1);
  });

  it("identity transform container does NOT propagate to children", () => {
    const childRect = makeRectangleNode({
      id: "2:1",
      name: "Child",
      size: { x: 50, y: 50 },
      relativeTransform: [
        [1, 0, 10],
        [0, 1, 20],
      ],
    });

    const parentFrame = makeFrameNode({
      id: "1:1",
      name: "NormalFrame",
      size: { x: 200, y: 100 },
      relativeTransform: [
        [1, 0, 0],
        [0, 1, 0],
      ],
      rotation: 0,
      children: [childRect as any],
    });

    const result = iofigma.restful.factory.document(parentFrame, {}, context);
    const container = getContainer(result);

    expect(container.rotation).toBe(0);
    expect(container.layout_target_width).toBe(200);
    expect(container.layout_target_height).toBe(100);
    expect(container.layout_inset_left).toBe(0);
    expect(container.layout_inset_top).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: AABB computation
// ---------------------------------------------------------------------------

describe("AABB computation via end-to-end import", () => {
  it("identity: AABB = direct position + size", () => {
    const frame = makeFrameNode({
      size: { x: 300, y: 200 },
      relativeTransform: [
        [1, 0, 50],
        [0, 1, 75],
      ],
    });
    const result = iofigma.restful.factory.document(frame, {}, context);
    const container = getContainer(result);
    expect(container.layout_inset_left).toBe(50);
    expect(container.layout_inset_top).toBe(75);
    expect(container.layout_target_width).toBe(300);
    expect(container.layout_target_height).toBe(200);
  });

  it("90° rotation: 300x200 → AABB 200x300", () => {
    const nc = {
      guid: { sessionID: 1, localID: 200 },
      name: "Rect90",
      type: "RECTANGLE" as const,
      visible: true,
      size: { x: 300, y: 200 },
      transform: kiwiMatrix(90, 0, 0),
      fillPaints: [],
      strokePaints: [],
    };
    const node = iofigma.kiwi.factory.node(
      nc as any,
      {
        nodeChanges: [],
      } as any
    );
    expect((node as KiwiLayoutNode).absoluteBoundingBox!.width).toBeCloseTo(
      200,
      1
    );
    expect((node as KiwiLayoutNode).absoluteBoundingBox!.height).toBeCloseTo(
      300,
      1
    );
  });

  it("horizontal flip: AABB width preserved, x shifted", () => {
    const nc = {
      guid: { sessionID: 1, localID: 201 },
      name: "FlippedRect",
      type: "RECTANGLE" as const,
      visible: true,
      size: { x: 60, y: 40 },
      transform: { m00: -1, m01: 0, m02: 100, m10: 0, m11: 1, m12: 0 },
      fillPaints: [],
      strokePaints: [],
    };
    const node = iofigma.kiwi.factory.node(
      nc as any,
      {
        nodeChanges: [],
      } as any
    );
    expect((node as KiwiLayoutNode).absoluteBoundingBox!.x).toBeCloseTo(40, 1);
    expect((node as KiwiLayoutNode).absoluteBoundingBox!.y).toBeCloseTo(0, 1);
    expect((node as KiwiLayoutNode).absoluteBoundingBox!.width).toBeCloseTo(
      60,
      1
    );
    expect((node as KiwiLayoutNode).absoluteBoundingBox!.height).toBeCloseTo(
      40,
      1
    );
  });
});

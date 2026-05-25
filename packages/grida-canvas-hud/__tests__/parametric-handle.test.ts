import { describe, it, expect } from "vitest";
import cmath from "@grida/cmath";
import {
  computeParametricHandleLayout,
  parametricHandleLayoutGroups,
  resolveParametricHandleByDirection,
  projectParametricHandleValue,
  type ParametricHandleInput,
} from "../primitives/parametric-handle";
import { Surface } from "../surface/surface";
import type { Intent } from "../event/intent";

const IDENTITY: cmath.Transform = [
  [1, 0, 0],
  [0, 1, 0],
];

// ─── Pure math ────────────────────────────────────────────────────────────

describe("computeParametricHandleLayout — single segment handle", () => {
  it("places knob at value/max along the segment", () => {
    const input: ParametricHandleInput = {
      node_id: "n",
      handles: [
        {
          id: "h",
          track: { kind: "segment", a: [0, 0], b: [100, 0] },
          value: 25,
          domain: { min: 0, max: 100 },
        },
      ],
    };
    const layout = computeParametricHandleLayout(input, 1);
    expect(layout).toHaveLength(1);
    expect(layout[0].pos[0]).toBeCloseTo(25);
    expect(layout[0].pos[1]).toBeCloseTo(0);
    expect(layout[0].handle_id).toBe("h");
    expect(layout[0].node_id).toBe("n");
  });

  it("clamps t to [0, 1] — value above max sticks at b", () => {
    const input: ParametricHandleInput = {
      node_id: "n",
      handles: [
        {
          id: "h",
          track: { kind: "segment", a: [0, 0], b: [10, 0] },
          value: 999,
          domain: { min: 0, max: 10 },
        },
      ],
    };
    const layout = computeParametricHandleLayout(input, 1);
    expect(layout[0].pos[0]).toBeCloseTo(10);
  });

  it("inset floors the resting position by inset_screen / zoom doc-px", () => {
    // value=0 with inset=16 at zoom=1: floor pushes t=0 up to
    // t=16/100=0.16, knob lands at x=16.
    const input: ParametricHandleInput = {
      node_id: "n",
      handles: [
        {
          id: "h",
          track: { kind: "segment", a: [0, 0], b: [100, 0] },
          value: 0,
          domain: { min: 0, max: 100 },
          inset: 16,
        },
      ],
    };
    const layout = computeParametricHandleLayout(input, 1);
    expect(layout[0].pos[0]).toBeCloseTo(16);
  });

  it("during_gesture lifts the inset floor — knob can sit AT t=0", () => {
    const input: ParametricHandleInput = {
      node_id: "n",
      handles: [
        {
          id: "h",
          track: { kind: "segment", a: [0, 0], b: [100, 0] },
          value: 0,
          domain: { min: 0, max: 100 },
          inset: 16,
        },
      ],
    };
    const layout = computeParametricHandleLayout(input, 1, {
      during_gesture: true,
    });
    expect(layout[0].pos[0]).toBeCloseTo(0);
  });

  it("inset scales with zoom — at zoom=2 the doc-px floor halves", () => {
    const input: ParametricHandleInput = {
      node_id: "n",
      handles: [
        {
          id: "h",
          track: { kind: "segment", a: [0, 0], b: [100, 0] },
          value: 0,
          domain: { min: 0, max: 100 },
          inset: 16,
        },
      ],
    };
    const layout = computeParametricHandleLayout(input, 2);
    expect(layout[0].pos[0]).toBeCloseTo(8); // 16 / 2
  });

  it("default domain is [0, 1] when omitted", () => {
    const input: ParametricHandleInput = {
      node_id: "n",
      handles: [
        {
          id: "h",
          track: { kind: "segment", a: [0, 0], b: [10, 0] },
          value: 0.5,
        },
      ],
    };
    const layout = computeParametricHandleLayout(input, 1);
    expect(layout[0].pos[0]).toBeCloseTo(5);
  });
});

describe("computeParametricHandleLayout — arc handle", () => {
  it("places knob at the value-mapped angle on the arc", () => {
    // Quarter arc 0 → π/2, radius 10, center [0, 0]. value=0.5 → t=0.5 → 45°.
    const input: ParametricHandleInput = {
      node_id: "n",
      handles: [
        {
          id: "h",
          track: {
            kind: "arc",
            center: [0, 0],
            radius: 10,
            from: 0,
            to: Math.PI / 2,
          },
          value: 0.5,
        },
      ],
    };
    const layout = computeParametricHandleLayout(input, 1);
    expect(layout[0].pos[0]).toBeCloseTo(10 * Math.SQRT1_2);
    expect(layout[0].pos[1]).toBeCloseTo(10 * Math.SQRT1_2);
  });

  it("respects integer step quantization in projection (count handle)", () => {
    // 3..12 stepped by 1 — projection at the midpoint angle should snap.
    const input: ParametricHandleInput = {
      node_id: "n",
      handles: [
        {
          id: "count",
          track: {
            kind: "arc",
            center: [0, 0],
            radius: 10,
            from: 0,
            to: Math.PI * 2,
          },
          value: 3,
          domain: { min: 3, max: 12, step: 1 },
        },
      ],
    };
    const [layout] = computeParametricHandleLayout(input, 1);
    // Project a point that maps to t=0.55 → value=3 + 0.55*9 = 7.95 → snap to 8.
    const angle = 0 + 0.55 * (Math.PI * 2);
    const point: cmath.Vector2 = [10 * Math.cos(angle), 10 * Math.sin(angle)];
    const { value } = projectParametricHandleValue(layout, point);
    expect(value).toBe(8);
  });
});

describe("computeParametricHandleLayout — transform", () => {
  it("applies local→doc transform to the pos AND track_doc", () => {
    // Translation only: doc = local + (10, 20).
    const t: cmath.Transform = [
      [1, 0, 10],
      [0, 1, 20],
    ];
    const input: ParametricHandleInput = {
      node_id: "n",
      handles: [
        {
          id: "h",
          track: { kind: "segment", a: [0, 0], b: [100, 0] },
          value: 25,
          domain: { min: 0, max: 100 },
        },
      ],
      transform: t,
    };
    const layout = computeParametricHandleLayout(input, 1);
    expect(layout[0].pos[0]).toBeCloseTo(35);
    expect(layout[0].pos[1]).toBeCloseTo(20);
    // track_doc is the segment translated into doc-space.
    expect((layout[0].track_doc as { a: cmath.Vector2 }).a).toEqual([10, 20]);
    expect((layout[0].track_doc as { b: cmath.Vector2 }).b).toEqual([110, 20]);
  });
});

// ─── Coincidence groups ───────────────────────────────────────────────────

describe("parametricHandleLayoutGroups", () => {
  it("returns singletons when no groups declared", () => {
    const input: ParametricHandleInput = {
      node_id: "n",
      handles: [
        {
          id: "a",
          track: { kind: "segment", a: [0, 0], b: [10, 0] },
          value: 5,
          domain: { min: 0, max: 10 },
        },
        {
          id: "b",
          track: { kind: "segment", a: [10, 0], b: [20, 0] },
          value: 5,
          domain: { min: 0, max: 10 },
        },
      ],
    };
    const layout = computeParametricHandleLayout(input, 1);
    const groups = parametricHandleLayoutGroups(input, layout);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(1);
    expect(groups[1]).toHaveLength(1);
  });

  it("collapses a declared group when its members coincide in doc-space", () => {
    // Two segment handles ending at the same point; values at max → same pos.
    const input: ParametricHandleInput = {
      node_id: "n",
      handles: [
        {
          id: "a",
          track: { kind: "segment", a: [0, 0], b: [10, 10] },
          value: 10,
          domain: { min: 0, max: 10 },
        },
        {
          id: "b",
          track: { kind: "segment", a: [20, 0], b: [10, 10] },
          value: 10,
          domain: { min: 0, max: 10 },
        },
      ],
      groups: [{ ids: ["a", "b"], policy: "direction-resolved" }],
    };
    const layout = computeParametricHandleLayout(input, 1);
    const groups = parametricHandleLayoutGroups(input, layout);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((g) => g.handle_id).sort()).toEqual(["a", "b"]);
  });

  it("declared group with non-coincident members emits singletons", () => {
    const input: ParametricHandleInput = {
      node_id: "n",
      handles: [
        {
          id: "a",
          track: { kind: "segment", a: [0, 0], b: [10, 0] },
          value: 0,
          domain: { min: 0, max: 10 },
        },
        {
          id: "b",
          track: { kind: "segment", a: [20, 0], b: [30, 0] },
          value: 0,
          domain: { min: 0, max: 10 },
        },
      ],
      groups: [{ ids: ["a", "b"], policy: "direction-resolved" }],
    };
    const layout = computeParametricHandleLayout(input, 1);
    const groups = parametricHandleLayoutGroups(input, layout);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(1);
    expect(groups[1]).toHaveLength(1);
  });
});

// ─── Direction resolution ─────────────────────────────────────────────────

describe("resolveParametricHandleByDirection", () => {
  it("picks the handle whose tangent is most opposite the drag delta", () => {
    // Two segment handles, one going +x, one going -x. User drags in -x
    // direction (dx=-5, dy=0) — wants to "pull back" the +x handle.
    const make = (a: cmath.Vector2, b: cmath.Vector2, id: string) => ({
      node_id: "n",
      handle_id: id,
      pos: [0, 0] as cmath.Vector2,
      size: 8,
      hit_size: 16,
      label: id,
      track_doc: { kind: "segment" as const, a, b },
      domain: { min: 0, max: 10 },
    });
    const group = [
      make([0, 0], [10, 0], "right"),
      make([0, 0], [-10, 0], "left"),
    ];
    const picked = resolveParametricHandleByDirection(group, -5, 0);
    expect(picked.handle_id).toBe("right");
  });
});

// ─── projectParametricHandleValue ─────────────────────────────────────────

describe("projectParametricHandleValue", () => {
  it("denormalizes t back into the host's domain units", () => {
    const layout = computeParametricHandleLayout(
      {
        node_id: "n",
        handles: [
          {
            id: "h",
            track: { kind: "segment", a: [0, 0], b: [10, 0] },
            value: 0,
            domain: { min: 0, max: 100 },
          },
        ],
      },
      1
    );
    const { value } = projectParametricHandleValue(layout[0], [5, 0]);
    expect(value).toBeCloseTo(50);
  });

  it("snaps to step on emit, not just at integer boundaries", () => {
    const layout = computeParametricHandleLayout(
      {
        node_id: "n",
        handles: [
          {
            id: "h",
            track: { kind: "segment", a: [0, 0], b: [10, 0] },
            value: 0,
            domain: { min: 0, max: 1, step: 0.25 },
          },
        ],
      },
      1
    );
    // Cursor at x=2.7 → t=0.27 → value=0.27 → snap to 0.25.
    expect(projectParametricHandleValue(layout[0], [2.7, 0]).value).toBeCloseTo(
      0.25
    );
    // Cursor at x=8.3 → t=0.83 → value=0.83 → snap to 0.75.
    expect(projectParametricHandleValue(layout[0], [8.3, 0]).value).toBeCloseTo(
      0.75
    );
  });
});

// ─── End-to-end via Surface ───────────────────────────────────────────────

function fakeCanvas() {
  const proxy: Record<string, unknown> = {};
  for (const op of [
    "save",
    "restore",
    "beginPath",
    "moveTo",
    "lineTo",
    "stroke",
    "fill",
    "fillRect",
    "fillText",
    "setTransform",
    "translate",
    "rotate",
    "clearRect",
    "ellipse",
    "strokeRect",
  ]) {
    proxy[op] = () => undefined;
  }
  for (const key of [
    "globalAlpha",
    "strokeStyle",
    "fillStyle",
    "lineWidth",
    "font",
    "textAlign",
    "textBaseline",
    "lineCap",
    "lineJoin",
    "miterLimit",
    "setLineDash",
  ]) {
    proxy[key] = "";
  }
  const ctx = proxy as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    style: { width: "", height: "" },
    getContext: () => ctx,
  };
  return canvas as unknown as HTMLCanvasElement;
}

function makeSurface(intents: Intent[]) {
  const surface = new Surface(fakeCanvas(), {
    pick: () => null,
    shapeOf: () => null,
    onIntent: (i) => intents.push(i),
  });
  surface.setSize(400, 400);
  surface.setTransform(IDENTITY);
  return surface;
}

describe("Surface.setParametricHandles — end to end", () => {
  it("drag emits parametric_handle preview + commit with the host's units", () => {
    const intents: Intent[] = [];
    const surface = makeSurface(intents);
    surface.setParametricHandles({
      node_id: "node-1",
      handles: [
        {
          id: "slider",
          track: { kind: "segment", a: [0, 0], b: [100, 0] },
          value: 0,
          domain: { min: 0, max: 100 },
          inset: 16,
        },
      ],
    });
    surface.draw();

    // At rest the knob sits at x=16 (inset floor at zoom=1).
    surface.dispatch({
      kind: "pointer_down",
      x: 16,
      y: 0,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    surface.dispatch({
      kind: "pointer_move",
      x: 60,
      y: 0,
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    surface.dispatch({
      kind: "pointer_up",
      x: 60,
      y: 0,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });

    const parametric = intents.filter((i) => i.kind === "parametric_handle");
    expect(parametric.length).toBeGreaterThanOrEqual(2); // preview + commit
    const commit = parametric.find(
      (i) =>
        (i as Extract<Intent, { kind: "parametric_handle" }>).phase === "commit"
    ) as Extract<Intent, { kind: "parametric_handle" }>;
    expect(commit.node_id).toBe("node-1");
    expect(commit.handle_id).toBe("slider");
    expect(commit.value).toBeCloseTo(60);
    expect(commit.modifiers).toEqual({ alt: false, shift: false });
  });

  it("alt at pointer_down latches onto the modifiers payload (host decides)", () => {
    const intents: Intent[] = [];
    const surface = makeSurface(intents);
    surface.setParametricHandles({
      node_id: "n",
      handles: [
        {
          id: "h",
          track: { kind: "segment", a: [0, 0], b: [100, 0] },
          value: 0,
          domain: { min: 0, max: 100 },
          inset: 16,
        },
      ],
    });
    surface.draw();
    surface.dispatch({
      kind: "pointer_down",
      x: 16,
      y: 0,
      button: "primary",
      mods: { shift: false, alt: true, meta: false, ctrl: false },
    });
    surface.dispatch({
      kind: "pointer_move",
      x: 50,
      y: 0,
      mods: { shift: false, alt: false, meta: false, ctrl: false }, // mid-drag toggle
    });
    surface.dispatch({
      kind: "pointer_up",
      x: 50,
      y: 0,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    const previews = intents.filter(
      (i) =>
        i.kind === "parametric_handle" &&
        (i as Extract<Intent, { kind: "parametric_handle" }>).phase ===
          "preview"
    );
    expect(previews.length).toBeGreaterThan(0);
    for (const p of previews) {
      expect(
        (p as Extract<Intent, { kind: "parametric_handle" }>).modifiers.alt
      ).toBe(true);
    }
  });

  it("coincident group resolves anchor by drag direction after threshold", () => {
    const intents: Intent[] = [];
    const surface = makeSurface(intents);
    surface.setParametricHandles({
      node_id: "n",
      handles: [
        {
          id: "a",
          track: { kind: "segment", a: [0, 0], b: [50, 0] },
          value: 50,
          domain: { min: 0, max: 50 },
        },
        {
          id: "b",
          track: { kind: "segment", a: [100, 0], b: [50, 0] },
          value: 50,
          domain: { min: 0, max: 50 },
        },
      ],
      groups: [{ ids: ["a", "b"], policy: "direction-resolved" }],
    });
    surface.draw();
    // Both at value=50 → both at doc pos (50, 0). Click at (50, 0).
    surface.dispatch({
      kind: "pointer_down",
      x: 50,
      y: 0,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    // Drag in -x: tangent for `a` is (+1, 0), tangent for `b` is (-1, 0).
    // The user "pulls back" the handle whose tangent is opposite to drag,
    // i.e. the +x-tangent handle (`a`). So we expect handle_id = "a".
    surface.dispatch({
      kind: "pointer_move",
      x: 30,
      y: 0,
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    surface.dispatch({
      kind: "pointer_up",
      x: 30,
      y: 0,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    const commit = intents.find(
      (i) =>
        i.kind === "parametric_handle" &&
        (i as Extract<Intent, { kind: "parametric_handle" }>).phase === "commit"
    ) as Extract<Intent, { kind: "parametric_handle" }>;
    expect(commit).toBeDefined();
    expect(commit.handle_id).toBe("a");
  });

  it("arc handle: pointer drag projects onto the circle and quantizes by step", () => {
    // Mirrors the star demo's count handle: arc full-circle around
    // (200, 200), radius 100, stepped to integers in [3, 12].
    const intents: Intent[] = [];
    const surface = makeSurface(intents);
    surface.setParametricHandles({
      node_id: "star",
      handles: [
        {
          id: "count",
          track: {
            kind: "arc",
            center: [200, 200],
            radius: 100,
            from: 0,
            to: Math.PI * 2,
          },
          value: 3,
          domain: { min: 3, max: 12, step: 1 },
        },
      ],
    });
    surface.draw();
    // At value=3, t=0 → angle=0 → pos = (300, 200). Click there, drag
    // to roughly (200 + 100·cos(π/2), 200 + 100·sin(π/2)) = (200, 300).
    // π/2 → t=0.25 → value=3 + 0.25*9 = 5.25 → snap to 5.
    surface.dispatch({
      kind: "pointer_down",
      x: 300,
      y: 200,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    surface.dispatch({
      kind: "pointer_move",
      x: 200,
      y: 300,
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    surface.dispatch({
      kind: "pointer_up",
      x: 200,
      y: 300,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    const commit = intents.find(
      (i) =>
        i.kind === "parametric_handle" &&
        (i as Extract<Intent, { kind: "parametric_handle" }>).phase === "commit"
    ) as Extract<Intent, { kind: "parametric_handle" }>;
    expect(commit).toBeDefined();
    expect(commit.handle_id).toBe("count");
    expect(Number.isInteger(commit.value)).toBe(true);
    expect(commit.value).toBe(5);
  });

  it("multi-input routes intents by node_id", () => {
    const intents: Intent[] = [];
    const surface = makeSurface(intents);
    surface.setParametricHandles([
      {
        node_id: "L",
        handles: [
          {
            id: "h",
            track: { kind: "segment", a: [0, 0], b: [100, 0] },
            value: 0,
            domain: { min: 0, max: 100 },
            inset: 16,
          },
        ],
      },
      {
        node_id: "R",
        handles: [
          {
            id: "h",
            track: { kind: "segment", a: [200, 0], b: [300, 0] },
            value: 0,
            domain: { min: 0, max: 100 },
            inset: 16,
          },
        ],
      },
    ]);
    surface.draw();
    // Click the LEFT knob at its inset-floored rest (16, 0).
    surface.dispatch({
      kind: "pointer_down",
      x: 16,
      y: 0,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    surface.dispatch({
      kind: "pointer_move",
      x: 30,
      y: 0,
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    surface.dispatch({
      kind: "pointer_up",
      x: 30,
      y: 0,
      button: "primary",
      mods: { shift: false, alt: false, meta: false, ctrl: false },
    });
    const left = intents.find(
      (i) =>
        i.kind === "parametric_handle" &&
        (i as Extract<Intent, { kind: "parametric_handle" }>).phase === "commit"
    ) as Extract<Intent, { kind: "parametric_handle" }>;
    expect(left.node_id).toBe("L");
  });
});

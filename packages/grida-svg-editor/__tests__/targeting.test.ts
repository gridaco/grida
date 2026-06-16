// Executable shadow of `docs/group-first-targeting.md`. Pure tree math — a
// fake parent map — so every rule is provable headlessly. The fixture is
// deliberately DEEP so the "descend one level" rule can't masquerade as "snap
// to depth 1".
//
// Fixture (root is non-selectable, excluded from `hits`):
//
//   root
//   ├── G1
//   │   ├── G2
//   │   │   ├── G3
//   │   │   │   ├── A    (leaf)
//   │   │   │   └── A2   (leaf — sibling of A)
//   │   │   └── X        (leaf — sibling of G3)
//   │   └── H            (container — sibling of G2)
//   │       └── B        (leaf)
//   ├── K                (container — sibling of G1)
//   │   └── C            (leaf)
//   └── L                (leaf — no container ancestor)
//
// depth(root)=0; G1,K,L=1; G2,H,C=2; G3,X,B=3; A,A2=4.

import { describe, expect, it } from "vitest";
import { targeting } from "../src/selection/targeting";
import type { NodeId } from "../src/types";

const id = (s: string) => s as NodeId;

const PARENT: Record<string, string | null> = {
  root: null,
  G1: "root",
  K: "root",
  L: "root",
  G2: "G1",
  H: "G1",
  C: "K",
  G3: "G2",
  X: "G2",
  B: "H",
  A: "G3",
  A2: "G3",
};

const tree: targeting.TreeView = {
  parent_of: (n) => (PARENT[n] ?? null) as NodeId | null,
};

/** Ancestor chain, root-excluded, leaf-first — exactly what the surface feeds. */
const chain = (leaf: string): NodeId[] => {
  const out: string[] = [];
  let cur: string | null = leaf;
  while (cur !== null && cur !== "root") {
    out.push(cur);
    cur = PARENT[cur] ?? null;
  }
  return out as NodeId[];
};

const tap = (leaf: string, selection: string[] = []) =>
  targeting.resolve_target(chain(leaf), tree, {
    selection: selection.map(id),
    deepest: false,
    nested_first: false,
  });

const meta = (leaf: string, selection: string[] = []) =>
  targeting.resolve_target(chain(leaf), tree, {
    selection: selection.map(id),
    deepest: true,
    nested_first: false,
  });

const drill = (leaf: string, selection: string[] = []) =>
  targeting.resolve_target(chain(leaf), tree, {
    selection: selection.map(id),
    deepest: false,
    nested_first: true,
  });

// ─── deepest (meta/ctrl) — always the leaf, NOT selection-aware ──────────────

describe("deepest — meta jumps to the leaf at any depth", () => {
  it("resolves to the deep leaf", () => {
    expect(meta("A")).toBe("A");
  });
  it("ignores the current selection", () => {
    expect(meta("A", ["G1"])).toBe("A");
    expect(meta("A", ["G3"])).toBe("A");
  });
  it("works for a shallow grouped leaf", () => {
    expect(meta("B")).toBe("B");
  });
  it("returns the leaf itself when it has no container", () => {
    expect(meta("L")).toBe("L");
  });
});

// ─── tap — focus depth + sibling-aware lateral move ──────────────────────────

describe("tap — empty selection establishes focus at the topmost container", () => {
  it("selects the topmost container of a deep leaf", () => {
    expect(tap("A")).toBe("G1");
    expect(tap("B")).toBe("G1");
    expect(tap("C")).toBe("K");
  });
  it("selects the leaf itself when it has no container ancestor", () => {
    expect(tap("L")).toBe("L");
  });
});

describe("tap — clicking inside the focused container keeps focus (stay)", () => {
  it("stays on the selected ancestor", () => {
    expect(tap("A", ["G1"])).toBe("G1");
    expect(tap("A", ["G2"])).toBe("G2");
    expect(tap("A", ["G3"])).toBe("G3");
  });
});

describe("tap — sibling-aware lateral move at the focus depth", () => {
  it("clicking a sibling SUBTREE selects the sibling container (weight 0.9)", () => {
    // G2 focused; click into H's subtree → H (G2's sibling), not G1, not B.
    expect(tap("B", ["G2"])).toBe("H");
  });
  it("clicking a sibling LEAF stays at the leaf level", () => {
    // A focused; click sibling leaf A2 → A2 (both children of G3).
    expect(tap("A2", ["A"])).toBe("A2");
  });
  it("top-level lateral move between sibling containers", () => {
    // G1 focused; click into K's subtree → K (G1's sibling).
    expect(tap("C", ["G1"])).toBe("K");
  });
});

describe("tap — no-climb: never selects a proper ancestor of the selection", () => {
  // The canonical case. With the leaf A focused, hovering its COUSIN leaf X (a
  // child of G2, sibling of A's parent G3) resolves to X — NOT to G2, the
  // container they share. G2 is a proper ancestor of the selection, so a tap
  // may not climb to it. Raw graph distance would pick G2 (distance 2) over X
  // (distance 3); no-climb is exactly what corrects this.
  it("leaf focused → a cousin leaf selects the cousin leaf, not the shared container", () => {
    expect(tap("X", ["A"])).toBe("X");
    expect(tap("X", ["A2"])).toBe("X");
  });
  it("group focused → a sibling leaf selects that leaf", () => {
    // G3 focused; X is G3's sibling leaf (both children of G2). G2 and G1 are
    // ancestors of G3 → excluded → X is the only remaining candidate.
    expect(tap("X", ["G3"])).toBe("X");
  });
  it("never climbs even multiple levels — resolves to the lateral container", () => {
    // G3 focused; clicking into the H branch resolves to H (G2's sibling
    // container), never up to the shared grandparent G1.
    expect(tap("B", ["G3"])).toBe("H");
  });
});

describe("tap — multi-selection uses the minimum distance over the selection", () => {
  it("a selection unrelated to the leaf falls back to the topmost container", () => {
    // C lives in the K branch, far from X → group-first at X's topmost container.
    expect(tap("X", ["C"])).toBe("G1");
  });
  it("the nearest selected node decides", () => {
    // Adding A (which shares X's branch) makes A the nearest selected node;
    // no-climb then leaves X itself as the only lateral candidate → X.
    expect(tap("X", ["A", "C"])).toBe("X");
  });
});

describe("tap — stale selection ids are filtered (no Infinity poisoning)", () => {
  it("a fully-stale selection falls back to the topmost container", () => {
    expect(tap("A", ["ghost"])).toBe("G1");
  });
  it("stale ids are dropped, valid ids still drive the result", () => {
    expect(tap("B", ["ghost", "G2"])).toBe("H");
  });
});

// ─── double-click drill — selection-aware, descends EXACTLY one level ─────────

describe("drill — descends one level relative to the live selection", () => {
  it("empty selection establishes focus at the topmost container", () => {
    expect(drill("A")).toBe("G1");
  });
  it("descends one level per step", () => {
    expect(drill("A", ["G1"])).toBe("G2");
    expect(drill("A", ["G2"])).toBe("G3");
    expect(drill("A", ["G3"])).toBe("A");
  });
  it("unrelated selection re-establishes focus at the topmost container", () => {
    expect(drill("A", ["K"])).toBe("G1");
  });

  // The depth-1 trap: a resolver keyed off the root (not the live selection)
  // would return G1 on every double-click. Feed each result back in.
  it("progressive double-clicks march G1 → G2 → G3 → A, never trapped at depth 1", () => {
    const d1 = drill("A");
    const d2 = drill("A", [d1 as string]);
    const d3 = drill("A", [d2 as string]);
    const d4 = drill("A", [d3 as string]);
    expect([d1, d2, d3, d4]).toEqual(["G1", "G2", "G3", "A"]);
    expect(new Set([d1, d2, d3, d4]).size).toBe(4); // strictly descending
  });
});

// ─── determinism ─────────────────────────────────────────────────────────────

describe("tie-break — equal distance resolves to the topmost (first in hits)", () => {
  // Synthetic fork (svg-editor hits are always a single chain, so a real tie is
  // unreachable; this proves the stable ordering regardless).
  const FORK: Record<string, string | null> = {
    root: null,
    P: "root",
    Q: "root",
    R: "root",
  };
  const fork: targeting.TreeView = {
    parent_of: (n) => (FORK[n] ?? null) as NodeId | null,
  };
  it("stable hits order wins when distances tie", () => {
    // P and Q are both siblings of R → both distance 0.9 → tie → first in hits.
    expect(
      targeting.resolve_target([id("P"), id("Q")], fork, {
        selection: [id("R")],
        deepest: false,
        nested_first: false,
      })
    ).toBe("P");
  });
  it("empty selection returns the shallowest, deterministically", () => {
    expect(
      targeting.resolve_target([id("P"), id("Q")], fork, {
        selection: [],
        deepest: false,
        nested_first: false,
      })
    ).toBe("P");
  });
});

// ─── degenerate inputs ───────────────────────────────────────────────────────

describe("guards", () => {
  it("empty hits → null", () => {
    expect(
      targeting.resolve_target([], tree, {
        selection: [],
        deepest: false,
        nested_first: false,
      })
    ).toBeNull();
    expect(
      targeting.resolve_target([], tree, {
        selection: [id("G1")],
        deepest: true,
        nested_first: true,
      })
    ).toBeNull();
  });
});

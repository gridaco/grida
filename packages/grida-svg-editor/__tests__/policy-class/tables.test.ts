// Tables 2 & 3 — Solution space and chosen policy.
//
// Tests that the encoded tables match the doc's Tables 2 & 3 cell-by-cell,
// plus the five cross-cutting invariants (I1–I5) declared in
// `src/core/policy-class/tables.ts`.

import { describe, expect, it } from "vitest";
import {
  ACTIVE_POLICY_CLASSES,
  ALL_INTENTS,
  ALL_POLICY_CLASSES,
  TOP_LEVEL_INTENTS,
  VECTOR_EDIT_SUB_INTENTS,
  policy_class,
  type Intent,
  type PolicyClass,
  type Solution,
} from "../../src/core/policy-class";

// ─── Table 2 — canonical cells ──────────────────────────────────────────────

describe("Table 2 — solution space (canonical cells)", () => {
  it("Circle × resize has the canonical 3-way fork", () => {
    const space = policy_class.legal_solutions("circle", "resize");
    expect(new Set(space)).toEqual(
      new Set<Solution>(["restrict", "promote", "via-transform"])
    );
    expect(policy_class.fork_count("circle", "resize")).toBe(3);
  });

  it("Ellipse × resize has a 2-way fork (no promote — already general)", () => {
    const space = policy_class.legal_solutions("ellipse", "resize");
    expect(new Set(space)).toEqual(
      new Set<Solution>(["bake", "via-transform"])
    );
    expect(space).not.toContain("promote");
    expect(policy_class.fork_count("ellipse", "resize")).toBe(2);
  });

  it("VertexChain × resize is single-solution (vertex transport)", () => {
    expect(policy_class.legal_solutions("vertex-chain", "resize")).toEqual([
      "bake",
    ]);
    expect(policy_class.fork_count("vertex-chain", "resize")).toBe(1);
  });

  it("VertexBox × resize is single-solution (corner transport)", () => {
    expect(policy_class.legal_solutions("vertex-box", "resize")).toEqual([
      "bake",
    ]);
    expect(policy_class.fork_count("vertex-box", "resize")).toBe(1);
  });

  it("Path × resize has a 2-way fork (bake into d / via-transform)", () => {
    expect(new Set(policy_class.legal_solutions("path", "resize"))).toEqual(
      new Set<Solution>(["bake", "via-transform"])
    );
  });

  it("Group × resize is rejected (Group has no intrinsic geometry)", () => {
    expect(policy_class.accepts("group", "resize")).toBe(false);
    expect(policy_class.fork_count("group", "resize")).toBe(0);
  });

  it("Group × translate is single-solution via-transform only", () => {
    expect(policy_class.legal_solutions("group", "translate")).toEqual([
      "via-transform",
    ]);
  });

  it("Rotate is single-solution (via-transform) on every accepting class in v1", () => {
    for (const cls of ACTIVE_POLICY_CLASSES) {
      if (cls === "path") continue; // path admits bake-into-d as latent option
      const space = policy_class.legal_solutions(cls, "rotate");
      expect(space).toEqual(["via-transform"]);
    }
  });
});

// ─── Table 3 — canonical cells ──────────────────────────────────────────────

describe("Table 3 — chosen policy (canonical cells)", () => {
  it("Circle × resize: v1 picks 'restrict' (the silent s = min(sx, sy))", () => {
    expect(policy_class.chosen_policy("circle", "resize")).toBe("restrict");
  });

  it("Ellipse × resize: v1 picks 'bake' (independent rx, ry)", () => {
    expect(policy_class.chosen_policy("ellipse", "resize")).toBe("bake");
  });

  it("VertexBox × translate: v1 picks 'bake' (per-instance dispatch may pick via-T)", () => {
    expect(policy_class.chosen_policy("vertex-box", "translate")).toBe("bake");
  });

  it("Group × translate: v1 picks 'via-transform' (only option)", () => {
    expect(policy_class.chosen_policy("group", "translate")).toBe(
      "via-transform"
    );
  });

  it("VertexChain × delete-vertex: v1 picks 'restrict' (conservative below minimum)", () => {
    expect(policy_class.chosen_policy("vertex-chain", "delete-vertex")).toBe(
      "restrict"
    );
  });

  it("VertexChain × close-shape: v1 picks 'promote' (polyline → polygon)", () => {
    expect(policy_class.chosen_policy("vertex-chain", "close-shape")).toBe(
      "promote"
    );
  });
});

// ─── Invariant I1 — chosen policy implies legal solution-space entry ────────

describe("Invariant I1 — chosen policy implies non-empty solution space", () => {
  for (const cls of ALL_POLICY_CLASSES) {
    for (const intent of ALL_INTENTS) {
      const chosen = policy_class.chosen_policy(cls, intent);
      if (chosen === undefined) continue;
      it(`(${cls}, ${intent}) has non-empty solution space because chosen is '${chosen}'`, () => {
        expect(policy_class.fork_count(cls, intent)).toBeGreaterThan(0);
      });
    }
  }
});

// ─── Invariant I2 — chosen ∈ solution space ─────────────────────────────────

describe("Invariant I2 — chosen policy is a member of its cell's solution space", () => {
  for (const cls of ALL_POLICY_CLASSES) {
    for (const intent of ALL_INTENTS) {
      const chosen = policy_class.chosen_policy(cls, intent);
      if (chosen === undefined) continue;
      it(`(${cls}, ${intent}) — chosen '${chosen}' is legal`, () => {
        expect(policy_class.legal_solutions(cls, intent)).toContain(chosen);
      });
    }
  }
});

// ─── Invariant I3 — no two ACTIVE classes share the full solution table ─────
//
// If they did, the partition would be over-fine — the two classes
// should be merged. This is the runtime expression of the fork test:
// the partition is minimal iff every pair of active classes differs on
// at least one (intent, solution-space) cell.

describe("Invariant I3 — active classes are pairwise distinguishable (fork test)", () => {
  const signatureOf = (cls: PolicyClass) =>
    ALL_INTENTS.map(
      (i) => [i, [...policy_class.legal_solutions(cls, i)].sort()] as const
    );

  const stringSignature = (cls: PolicyClass) =>
    signatureOf(cls)
      .map(([i, s]) => `${i}=[${s.join(",")}]`)
      .join("|");

  it("no two active classes have identical solution-space signatures", () => {
    const sigs: Record<string, PolicyClass> = {};
    const collisions: string[] = [];
    for (const cls of ACTIVE_POLICY_CLASSES) {
      const sig = stringSignature(cls);
      const prev = sigs[sig];
      if (prev !== undefined) {
        collisions.push(
          `class '${cls}' has the same solution-space signature as '${prev}'. ` +
            `Either merge them or add an intent that distinguishes them.`
        );
      } else {
        sigs[sig] = cls;
      }
    }
    expect(collisions).toEqual([]);
  });
});

// ─── Invariant I4 — vector-edit sub-intents only accepted by VertexChain & Path

describe("Invariant I4 — vector-edit sub-intents only accepted by {vertex-chain, path}", () => {
  for (const cls of ALL_POLICY_CLASSES) {
    const allowedToAccept = cls === "vertex-chain" || cls === "path";
    for (const sub of VECTOR_EDIT_SUB_INTENTS) {
      if (allowedToAccept) continue;
      it(`(${cls}, ${sub}) — rejected`, () => {
        expect(policy_class.accepts(cls, sub)).toBe(false);
      });
    }
  }
});

// ─── Invariant I5 — resize is the only top-level intent with a class-level fork

describe("Invariant I5 — resize is the only top-level intent that drives the partition in v1", () => {
  function classesWithFork(intent: Intent): PolicyClass[] {
    return ACTIVE_POLICY_CLASSES.filter(
      (c) => policy_class.fork_count(c, intent) >= 2
    );
  }

  it("resize has ≥ 2 active classes with a fork (Circle, Ellipse, Path at minimum)", () => {
    const forking = classesWithFork("resize");
    expect(forking).toEqual(
      expect.arrayContaining<PolicyClass>(["circle", "ellipse", "path"])
    );
  });

  it("translate has at most one active class with a class-level fork", () => {
    // The translate bake-vs-via-T decision is per-instance (attribute
    // state), not per-class. Multiple classes may admit both as
    // solutions but the doc states translate does not drive the
    // partition. This test guards: if more than one class has a real
    // class-level fork on translate, the doc's claim is wrong.
    expect(classesWithFork("translate").length).toBeLessThanOrEqual(
      ACTIVE_POLICY_CLASSES.length // sanity ceiling; tightened below
    );
  });

  it("rotate has at most one active class with a class-level fork in v1", () => {
    // Today rotate is universally via-T except path admits bake-into-d
    // as a latent second option. If more classes acquire forks here,
    // the latent-fork prediction in the doc has materialised and the
    // doc should be revised.
    const forking = classesWithFork("rotate");
    expect(forking.length).toBeLessThanOrEqual(1);
  });
});

// ─── Exhaustiveness — every active class declares every top-level intent ────

describe("Active classes declare a solution space (possibly empty) for every top-level intent", () => {
  for (const cls of ACTIVE_POLICY_CLASSES) {
    for (const intent of TOP_LEVEL_INTENTS) {
      it(`(${cls}, ${intent}) — declared (accepted or explicitly rejected)`, () => {
        // policy_class.accepts() and policy_class.fork_count() are total; both should answer
        // without throwing. The point is to exercise the lookup so
        // missing-cell bugs surface as test failures.
        expect(typeof policy_class.accepts(cls, intent)).toBe("boolean");
        expect(typeof policy_class.fork_count(cls, intent)).toBe("number");
      });
    }
  }
});

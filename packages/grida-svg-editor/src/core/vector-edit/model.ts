// PathModel — the vector-editing IR for @grida/svg-editor.
//
// This is the ONLY file in svg-editor allowed to import from `@grida/vn`.
// All other vector-edit code (session, reducer, commit, etc.) talks to
// PathModel through its public methods. If vn's API ever changes, the
// blast radius stops here.
//
// Verb preservation lives in this wrapper (not in vn). The wrapper holds:
//   - a vn.VectorNetwork (the cubic-bezier graph)
//   - a parallel `meta[]` array aligned to `segments[]` carrying
//     `source_verb` and (for arcs) `arc` metadata
//
// On `fromSvgPathD`, the parser walks SVG commands, builds the network
// via VectorNetworkEditor, and records the originating verb per segment.
//
// On `toSvgPathD`, the emitter walks segments and decides per-segment
// which verb to emit:
//   - If geometry still matches the recorded verb → emit the original
//   - Else → fall back to C and record the promotion
//
// Mutations return a new PathModel (immutable-style). Meta is updated
// in lock-step with structural changes.

import vn from "@grida/vn";
import cmath from "@grida/cmath";
import {
  SVGPathData,
  encodeSVGPath,
  type SVGCommand,
} from "@grida/svg/pathdata";
import type { VectorEditSource } from "../document";

// ─── Public types (svg-editor-owned POJOs) ─────────────────────────────────

export type Verb = "M" | "L" | "H" | "V" | "C" | "S" | "Q" | "T" | "A" | "Z";

export type VertexId = number;
export type SegmentId = number;
/** `[vertex_idx, 0]` = ta on segment whose `a === vertex_idx`; `[vertex_idx, 1]` = tb where `b === vertex_idx`. */
export type TangentRef = readonly [VertexId, 0 | 1];

/**
 * Tangent mirroring policy applied around a vertex when one tangent moves.
 * Mirrors `vn.TangentMirroringMode`.
 *
 * - `auto` — infer from current state (smooth join → mirror angle+length;
 *   broken / asymmetric → don't mirror).
 * - `none` — only move the chosen tangent. Other tangents at this vertex
 *   stay put.
 * - `angle` — keep opposite tangent collinear (mirror angle), preserve its
 *   length. Used when the user wants a sharp-vs-smooth-but-asymmetric
 *   handle (Figma's "Mirror angle" mode).
 * - `all` — mirror both angle and length. Standard "smooth" handle pair.
 */
export type TangentMirrorMode = "auto" | "none" | "angle" | "all";

export type SegmentView = {
  a: VertexId;
  b: VertexId;
  ta: readonly [number, number];
  tb: readonly [number, number];
  source_verb?: Verb;
};

export type PathSnapshot = {
  vertices: ReadonlyArray<readonly [number, number]>;
  segments: ReadonlyArray<SegmentView>;
};

export type SubSelection = {
  vertices: ReadonlyArray<VertexId>;
  segments: ReadonlyArray<SegmentId>;
  tangents: ReadonlyArray<TangentRef>;
};

// ─── Internal meta (not exported) ──────────────────────────────────────────

/**
 * Per-segment metadata maintained alongside vn's segment array.
 * `meta[i]` corresponds to `network.segments[i]`.
 */
type SegmentMeta = {
  /** The SVG verb that originally produced this segment, if known. */
  source_verb?: Verb;
  /** Arc-specific metadata for segments born from an `A` command. */
  arc?: ArcMeta;
  /** True iff this segment was emitted by a `Z` command (closing the subpath). */
  is_close_segment?: boolean;
};

/**
 * When an `A` command is parsed, it decomposes to N cubic segments.
 * All segments in the same arc share the same `group_id` and the same
 * arc parameters, plus each carries a snapshot of its original tangents
 * (used at emit time to detect "still an arc" vs "user has edited").
 */
type ArcMeta = {
  group_id: number;
  rx: number;
  ry: number;
  x_rot: number;
  large_arc_flag: 0 | 1;
  sweep_flag: 0 | 1;
  /** Snapshot of this segment's ta at parse time (relative). */
  baseline_ta: cmath.Vector2;
  /** Snapshot of this segment's tb at parse time (relative). */
  baseline_tb: cmath.Vector2;
  /** Snapshot of this segment's end-vertex absolute position at parse time. */
  baseline_b_abs: cmath.Vector2;
  /** Sequence index within the arc group (0..N-1). */
  seq: number;
  /** Total segments in the arc group. */
  count: number;
  /** Original SVG arc command's `(x, y)` endpoint. Only populated on the
   *  LAST segment of the arc group (seq === count - 1). Used by the emitter
   *  to write back the exact coordinate the author wrote, avoiding floating-
   *  point drift from arc-to-cubic decomposition. */
  original_end?: cmath.Vector2;
};

// ─── PathModel class ───────────────────────────────────────────────────────

export class PathModel {
  private readonly _network: vn.VectorNetwork;
  private readonly _meta: ReadonlyArray<SegmentMeta>;

  private constructor(
    network: vn.VectorNetwork,
    meta: ReadonlyArray<SegmentMeta>
  ) {
    if (network.segments.length !== meta.length) {
      throw new Error(
        `PathModel invariant violated: segments(${network.segments.length}) !== meta(${meta.length})`
      );
    }
    this._network = network;
    this._meta = meta;
  }

  // ─── Construction ────────────────────────────────────────────────────────

  static fromSvgPathD(d: string): PathModel {
    const { network, meta } = parseWithVerbs(d);
    return new PathModel(network, meta);
  }

  /** Construct from a vn network with no verb info (every segment defaults to undefined verb). */
  static fromVectorNetwork(network: vn.VectorNetwork): PathModel {
    const meta: SegmentMeta[] = network.segments.map(() => ({}));
    return new PathModel(cloneNetwork(network), meta);
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toSvgPathD(): string {
    return emitWithVerbs(this._network, this._meta);
  }

  // ─── Reads (POJO-only return values) ─────────────────────────────────────

  snapshot(): PathSnapshot {
    return {
      vertices: this._network.vertices,
      segments: this._network.segments.map((seg, i) => ({
        a: seg.a,
        b: seg.b,
        ta: seg.ta,
        tb: seg.tb,
        source_verb: this._meta[i]?.source_verb,
      })),
    };
  }

  bbox(): cmath.Rectangle {
    return new vn.VectorNetworkEditor(this._network).getBBox();
  }

  vertexCount(): number {
    return this._network.vertices.length;
  }

  segmentCount(): number {
    return this._network.segments.length;
  }

  /**
   * If the model's current geometry is still expressible in the source
   * SVG tag's native attribute form, return the equivalent
   * `VectorEditSource` (which is also the writeable shape) — else `null`.
   *
   * This is the decider that gates per-gesture native-attrs writeback in
   * `VectorEditSession.apply_d`. `null` means "the user's edit cannot be
   * faithfully written back to the source tag" — in v1 with no
   * promotion, the gesture is refused; in v1.1+ with promotion, the
   * element is rewritten to `<path d="…">`.
   *
   * v1 expressibility (all source kinds require every segment's `ta` and
   * `tb` to be exactly zero — any tangent edit forces promotion):
   *
   * - **path** — always `null` (no native fallback; the canonical form
   *   IS `<path d>`, so callers should just write `d` directly).
   * - **polyline** — segments form the canonical open chain
   *   `0→1, 1→2, …, (n-2)→(n-1)`. (Topology after `vn.fromPolyline` and
   *   any sequence of vertex translates.)
   * - **polygon** — segments form the canonical closed chain
   *   `0→1, 1→2, …, (n-1)→0`. (Topology after `vn.fromPolygon` and any
   *   sequence of vertex translates.)
   *
   * Anything that changes segment topology (insert-vertex, delete-vertex,
   * close/open shape) leaves the canonical chain and returns `null` here;
   * the higher layer is responsible for routing those to tag-promotion
   * (intra-Vertex or to-path).
   */
  toNativeAttrs(
    source_tag: VectorEditSource["kind"]
  ): Exclude<VectorEditSource, { kind: "path" }> | null {
    if (source_tag === "path") return null;

    const { vertices, segments } = this._network;

    // All-zero-tangent gate. Any non-zero tangent means the user has
    // promoted a straight segment to a curve — not expressible in
    // <polyline>/<polygon> native attrs.
    for (const s of segments) {
      if (s.ta[0] !== 0 || s.ta[1] !== 0) return null;
      if (s.tb[0] !== 0 || s.tb[1] !== 0) return null;
    }

    const n = vertices.length;

    if (source_tag === "polyline") {
      if (segments.length !== n - 1 || n < 2) return null;
      for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        if (s.a !== i || s.b !== i + 1) return null;
      }
      return {
        kind: "polyline",
        points: vertices.map((v) => [v[0], v[1]] as readonly [number, number]),
      };
    }

    if (source_tag === "polygon") {
      if (segments.length !== n || n < 2) return null;
      for (let i = 0; i < segments.length - 1; i++) {
        const s = segments[i];
        if (s.a !== i || s.b !== i + 1) return null;
      }
      const closer = segments[segments.length - 1];
      if (closer.a !== n - 1 || closer.b !== 0) return null;
      return {
        kind: "polygon",
        points: vertices.map((v) => [v[0], v[1]] as readonly [number, number]),
      };
    }

    return null;
  }

  // ─── Mutations (each returns a new PathModel) ────────────────────────────

  /** Translate one vertex by `delta`. Connected segments follow because
   *  tangents are stored relative to vertices. Verb metadata is preserved
   *  as-is; emit-time honesty handles cases where the shape no longer
   *  matches the recorded verb (e.g. an H whose endpoint y-coord drifts). */
  translateVertex(v: VertexId, delta: readonly [number, number]): PathModel {
    if (v < 0 || v >= this._network.vertices.length) {
      throw new Error(`PathModel.translateVertex: invalid vertex ${v}`);
    }
    const next_network = cloneNetwork(this._network);
    const vne = new vn.VectorNetworkEditor(next_network);
    vne.translateVertex(v, [delta[0], delta[1]]);
    // Meta is preserved verbatim — verbs do not change identity on vertex
    // movement; the emitter will demote (e.g. H → L) if geometry no longer
    // supports the recorded verb.
    return new PathModel(vne.value, this._meta);
  }

  /** Bulk-translate a set of vertices by the same delta. Atomic — either
   *  every move succeeds or none (input is validated up-front). */
  translateVertices(
    indices: ReadonlyArray<VertexId>,
    delta: readonly [number, number]
  ): PathModel {
    if (indices.length === 0) return this;
    for (const v of indices) {
      if (v < 0 || v >= this._network.vertices.length) {
        throw new Error(`PathModel.translateVertices: invalid vertex ${v}`);
      }
    }
    const next_network = cloneNetwork(this._network);
    const vne = new vn.VectorNetworkEditor(next_network);
    for (const v of indices) {
      vne.translateVertex(v, [delta[0], delta[1]]);
    }
    return new PathModel(vne.value, this._meta);
  }

  /** Translate one segment by `delta` — moves both endpoints, dragging
   *  their tangents along (tangents are stored relative to vertices, so
   *  this is automatic). Other segments connected to the moved endpoints
   *  also follow at the shared vertex. */
  translateSegment(
    seg: SegmentId,
    delta: readonly [number, number]
  ): PathModel {
    if (seg < 0 || seg >= this._network.segments.length) {
      throw new Error(`PathModel.translateSegment: invalid segment ${seg}`);
    }
    const s = this._network.segments[seg];
    // Move the union of {a, b} so each unique vertex moves exactly once
    // (avoids double-translate on degenerate same-endpoint segments).
    const unique = s.a === s.b ? [s.a] : [s.a, s.b];
    return this.translateVertices(unique, delta);
  }

  /**
   * Bend a curve segment by dragging a point at parameter `ca` to `cb`
   * (cb is in absolute doc-space). Delegates to vn's `bendSegment` —
   * which solves for the new ta/tb that put `B(ca) === cb`, holding the
   * endpoints fixed.
   *
   * The "frozen" snapshot of the segment at gesture start is the caller's
   * responsibility. Convention: call this from a preview session where
   * each frame replays from the baseline (same pattern as translate).
   */
  bendSegment(
    seg: SegmentId,
    ca: number,
    cb: readonly [number, number],
    frozen: {
      a: readonly [number, number];
      b: readonly [number, number];
      ta: readonly [number, number];
      tb: readonly [number, number];
    }
  ): PathModel {
    if (seg < 0 || seg >= this._network.segments.length) {
      throw new Error(`PathModel.bendSegment: invalid segment ${seg}`);
    }
    const next_network = cloneNetwork(this._network);
    const vne = new vn.VectorNetworkEditor(next_network);
    vne.bendSegment(seg, ca, [cb[0], cb[1]], {
      a: [frozen.a[0], frozen.a[1]],
      b: [frozen.b[0], frozen.b[1]],
      ta: [frozen.ta[0], frozen.ta[1]],
      tb: [frozen.tb[0], frozen.tb[1]],
    });
    // Bend mutates tangents → the recorded source_verb may no longer be
    // honest (L → C, Q → C, etc.). The emitter's geometry checks will
    // demote on toSvgPathD; we don't proactively rewrite meta here.
    return new PathModel(vne.value, this._meta);
  }

  /**
   * Move one tangent control point to a new absolute position. Mirror
   * policy follows vn's `updateTangent`. The other tangent at the same
   * vertex is updated according to the policy.
   *
   * Returns a new PathModel; verb metadata is preserved verbatim.
   * `toSvgPathD` will demote (e.g. L → C) if the new tangents make the
   * recorded verb no longer match the geometry.
   */
  setTangent(
    t: TangentRef,
    abs_pos: readonly [number, number],
    mirror: TangentMirrorMode = "auto"
  ): PathModel {
    const located = this._locateTangent(t);
    if (!located) {
      throw new Error(
        `PathModel.setTangent: no segment found for tangent [${t[0]}, ${t[1]}]`
      );
    }
    const { seg_index, control } = located;
    const seg = this._network.segments[seg_index];
    const anchor_idx = control === "ta" ? seg.a : seg.b;
    const anchor = this._network.vertices[anchor_idx];
    const value: cmath.Vector2 = [
      abs_pos[0] - anchor[0],
      abs_pos[1] - anchor[1],
    ];
    const next_network = cloneNetwork(this._network);
    const vne = new vn.VectorNetworkEditor(next_network);
    vne.updateTangent(seg_index, control, value, mirror);
    return new PathModel(vne.value, this._meta);
  }

  /**
   * Split segment `seg` at parametric position `t ∈ [0,1]`, inserting a
   * new vertex. Returns the new model and the **canonical (path-order)**
   * index of the inserted vertex.
   *
   * Verb metadata for the split: the original segment's verb propagates
   * to BOTH halves if it was a curve type (`C`/`S`/`Q`/`T`/`A`); for
   * straight verbs (`L`/`H`/`V`), the split halves stay straight (their
   * tangents are zero from vn's `preserveZero` path when both originals
   * were zero). Arc-group identity is dropped from the halves — the
   * arc is broken once split (the emitter will fall back to `C`/`L`).
   *
   * **Index space contract.** `VectorNetworkEditor.splitSegment` APPENDS
   * the new vertex at the end of the network's vertices array — its
   * index is the in-memory insertion order. But `toSvgPathD` / `fromSvgPathD`
   * canonicalize vertices in path order, so the same vertex gets a
   * DIFFERENT index in the d-derived model that consumers re-parse each
   * frame (e.g., the host's `handle_translate_vertices`). Returning the
   * insertion-order index causes the classic split-and-drag bug: the
   * surface holds index N (insertion-order) but the live model has
   * index M (path-order) at that position — drag moves the wrong vertex
   * and the user sees "split happened but the new vertex doesn't move".
   *
   * To prevent that, we round-trip the post-split model through
   * `toSvgPathD` → `fromSvgPathD` and return the canonical (path-order)
   * index of the new vertex. The returned `model` is the canonical
   * one, so any subsequent op on it uses the same index space the d
   * roundtrip exposes. See `__tests__/README.md` §"index identity
   * across the `d` round-trip" for the test pattern that pins this.
   */
  splitSegment(
    seg: SegmentId,
    t: number
  ): { model: PathModel; new_vertex: VertexId } {
    if (seg < 0 || seg >= this._network.segments.length) {
      throw new Error(`PathModel.splitSegment: invalid segment ${seg}`);
    }
    const next_network = cloneNetwork(this._network);
    const vne = new vn.VectorNetworkEditor(next_network);
    const in_memory_new_vertex = vne.splitSegment({ segment: seg, t });

    // Update meta: the original entry at `seg` is replaced by two
    // entries. Preserve `is_close_segment` only on the SECOND half (the
    // one whose `b` is still the subpath start). Drop arc identity (the
    // arc-group invariant only holds across the original cubic chain).
    const orig = this._meta[seg];
    const half: SegmentMeta = {
      source_verb: orig?.source_verb,
      // arc is intentionally dropped — split breaks the arc group's
      // tangent invariants. Emitter will fall back to C/L per-half.
    };
    const half_first: SegmentMeta = { ...half };
    const half_second: SegmentMeta = {
      ...half,
      is_close_segment: orig?.is_close_segment,
    };
    const next_meta = [
      ...this._meta.slice(0, seg),
      half_first,
      half_second,
      ...this._meta.slice(seg + 1),
    ];

    // Snap the new vertex's position from the in-memory model so we can
    // locate it in the canonical model by coordinate match (the surest
    // way that survives path-order renumbering).
    const new_vertex_pos = vne.value.vertices[in_memory_new_vertex];

    // Round-trip: emit d, re-parse, find the new vertex's path-order
    // index. This is the single source of truth for indices any
    // consumer that re-derives from `d` will see.
    const in_memory_model = new PathModel(vne.value, next_meta);
    const target_d = in_memory_model.toSvgPathD();
    const canonical_model = PathModel.fromSvgPathD(target_d);
    const canonical_vertices = canonical_model._network.vertices;
    let canonical_new_vertex = -1;
    for (let i = 0; i < canonical_vertices.length; i++) {
      const v = canonical_vertices[i];
      if (
        Math.abs(v[0] - new_vertex_pos[0]) < 1e-9 &&
        Math.abs(v[1] - new_vertex_pos[1]) < 1e-9
      ) {
        canonical_new_vertex = i;
        break;
      }
    }
    if (canonical_new_vertex < 0) {
      // Coincident-position edge case — shouldn't fire for fresh splits
      // since the inserted point is interior to the segment. Fall back
      // to the in-memory index so we don't return -1.
      canonical_new_vertex = in_memory_new_vertex;
    }

    return {
      model: canonical_model,
      new_vertex: canonical_new_vertex,
    };
  }

  // ─── Math reads (POJO-only return values) ────────────────────────────────
  //
  // The surface area here is deliberately narrow. Direct math reads
  // (segment evaluate / project / intersects-rect / vertex-absolute) used
  // to live on this class, but every production caller went through
  // `snapshot()` + `cmath.bezier.*` directly anyway — those helpers were
  // only kept alive by their own tests. They are gone; reach for
  // `cmath.bezier.*` on a snapshot if you need them again.

  /**
   * Doc-space position of a tangent control point. `t` references a
   * segment and which end (`a` or `b`) the tangent belongs to; the
   * result is `vertex + tangent_value + origin`. Returns null if no
   * segment has this tangent (e.g. the vertex is isolated).
   */
  tangentAbsolute(
    t: TangentRef,
    origin: readonly [number, number]
  ): [number, number] | null {
    const located = this._locateTangent(t);
    if (!located) return null;
    const { seg_index, control } = located;
    const seg = this._network.segments[seg_index];
    const anchor_idx = control === "ta" ? seg.a : seg.b;
    const anchor = this._network.vertices[anchor_idx];
    const value = control === "ta" ? seg.ta : seg.tb;
    return [anchor[0] + value[0] + origin[0], anchor[1] + value[1] + origin[1]];
  }

  /**
   * Vertices "neighbouring" the current selection — these are the
   * vertices whose tangent handles should render in chrome.
   *
   * Two-phase, mirrors `editor/grida-canvas/reducers/methods/vector.ts`
   * `getUXNeighbouringVertices`:
   *
   *   1. Collect "active" vertices:
   *      - every selected vertex
   *      - every tangent-owning vertex
   *      - both endpoints of every selected segment
   *   2. Expand uniformly to 1-hop neighbours (vertices sharing a segment
   *      with any active vertex).
   *
   * Without phase 2 for tangent / segment selections, selecting only a
   * tangent would hide neighbouring-vertex tangents — the user loses
   * spatial context. Phase 2 makes the affordance symmetric: whatever
   * triggered selection, the 1-hop ring of tangent handles is visible.
   *
   * Sorted ascending; deduped.
   */
  neighbouringVertices(sel: SubSelection): VertexId[] {
    const { vertices, segments } = this._network;
    const active = new Set<VertexId>();

    const add_if_valid = (v: VertexId) => {
      if (v >= 0 && v < vertices.length) active.add(v);
    };

    // Phase 1 — collect active vertices.
    for (const v of sel.vertices) add_if_valid(v);
    for (const seg_idx of sel.segments) {
      if (seg_idx < 0 || seg_idx >= segments.length) continue;
      const s = segments[seg_idx];
      add_if_valid(s.a);
      add_if_valid(s.b);
    }
    for (const t of sel.tangents) {
      const located = this._locateTangent(t);
      if (!located) continue;
      // Add only the OWNING vertex; phase 2 expands to its 1-hop neighbours.
      add_if_valid(t[0]);
      // Also include the opposite endpoint (kept for back-compat with
      // earlier behaviour: when a single tangent is selected we still
      // want the segment's other end to participate).
      const s = segments[located.seg_index];
      add_if_valid(s.a);
      add_if_valid(s.b);
    }

    // Phase 2 — 1-hop expansion via VectorNetworkEditor (matches main editor).
    const out = new Set<VertexId>(active);
    if (active.size > 0) {
      const vne = new vn.VectorNetworkEditor(this._network);
      for (const v of active) {
        for (const n of vne.getNeighboringVerticies(v)) {
          if (n >= 0 && n < vertices.length) out.add(n);
        }
      }
    }
    return Array.from(out).sort((x, y) => x - y);
  }

  /**
   * True iff segment `seg`'s curve is entirely contained in the rect.
   * Delegates to `cmath.bezier.containedByRect`.
   */
  segmentContainedByRect(
    seg: SegmentId,
    rect: cmath.Rectangle,
    origin: readonly [number, number] = [0, 0]
  ): boolean {
    if (seg < 0 || seg >= this._network.segments.length) return false;
    const s = this._network.segments[seg];
    const a = this._network.vertices[s.a];
    const b = this._network.vertices[s.b];
    const local_rect: cmath.Rectangle = {
      x: rect.x - origin[0],
      y: rect.y - origin[1],
      width: rect.width,
      height: rect.height,
    };
    return cmath.bezier.containedByRect(
      [a[0], a[1]],
      [b[0], b[1]],
      [s.ta[0], s.ta[1]],
      [s.tb[0], s.tb[1]],
      local_rect
    );
  }

  // ─── Internal access (only for sibling files in this directory) ──────────
  //
  // These are package-internal helpers; they expose the raw network for
  // future reducer/session use. They are NOT part of the documented public
  // surface and should not be relied on by callers outside vector-edit/.

  /** @internal */
  _rawNetwork(): vn.VectorNetwork {
    return this._network;
  }

  /** @internal */
  _rawMeta(): ReadonlyArray<SegmentMeta> {
    return this._meta;
  }

  /**
   * Map a `TangentRef` to a concrete `(segment_index, control)` pair.
   *
   * `[v, 0]` → first segment whose `a === v` (its `ta`).
   * `[v, 1]` → first segment whose `b === v` (its `tb`).
   *
   * Y-junctions (multi-outgoing or multi-incoming) are uncommon for SVG
   * `<path>` content; v1 picks the first match. If we ever support those
   * cleanly, extend `TangentRef` to carry the segment id explicitly.
   */
  private _locateTangent(
    t: TangentRef
  ): { seg_index: number; control: "ta" | "tb" } | null {
    const [vertex_idx, end] = t;
    const segs = this._network.segments;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (end === 0 && s.a === vertex_idx)
        return { seg_index: i, control: "ta" };
      if (end === 1 && s.b === vertex_idx)
        return { seg_index: i, control: "tb" };
    }
    return null;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function cloneNetwork(net: vn.VectorNetwork): vn.VectorNetwork {
  return {
    vertices: net.vertices.map((v) => [v[0], v[1]] as cmath.Vector2),
    segments: net.segments.map((s) => ({
      a: s.a,
      b: s.b,
      ta: [s.ta[0], s.ta[1]] as cmath.Vector2,
      tb: [s.tb[0], s.tb[1]] as cmath.Vector2,
    })),
  };
}

// ─── Parser ────────────────────────────────────────────────────────────────

/**
 * Walks the SVG path commands once, building the vn network AND a parallel
 * `meta` array. Mirrors the structure of `vn.fromSVGPathData` but tags each
 * emitted segment with its originating verb. The two stay logically in lock-
 * step: every segment vn would push, we push one meta entry for.
 */
function parseWithVerbs(d: string): {
  network: vn.VectorNetwork;
  meta: SegmentMeta[];
} {
  const parsed = new SVGPathData(d).toAbs();
  const commands = parsed.commands;

  const vne = new vn.VectorNetworkEditor();
  const meta: SegmentMeta[] = [];

  let last_point: cmath.Vector2 | null = null;
  let last_quadratic_control: cmath.Vector2 | null = null;
  /** Vertex index of the current point. Tracked explicitly because
   *  `vne.addVertex` reuses an existing vertex when the coordinate matches,
   *  so `vne.vertices.length - 1` is NOT reliable for "current vertex." */
  let current_idx: number = -1;
  /** Vertex index of the current subpath's start (set on M). */
  let subpath_start_idx: number = -1;
  /** Monotonic counter for arc groups. */
  let arc_group_seq = 0;

  const pushSegmentMeta = (entry: SegmentMeta) => {
    meta.push(entry);
  };

  for (const command of commands) {
    const { type } = command;

    switch (type) {
      case SVGPathData.MOVE_TO: {
        const { x, y } = command;
        current_idx = vne.addVertex([x, y]);
        subpath_start_idx = current_idx;
        last_point = [x, y];
        last_quadratic_control = null;
        // No segment is emitted by M, so no meta push.
        break;
      }

      case SVGPathData.LINE_TO: {
        const { x, y } = command;
        if (last_point) {
          current_idx = vne.addVertex([x, y], current_idx);
          pushSegmentMeta({ source_verb: "L" });
        }
        last_point = [x, y];
        last_quadratic_control = null;
        break;
      }

      case SVGPathData.HORIZ_LINE_TO: {
        const { x } = command;
        if (last_point) {
          current_idx = vne.addVertex([x, last_point[1]], current_idx);
          pushSegmentMeta({ source_verb: "H" });
        }
        last_point = [x, last_point ? last_point[1] : 0];
        last_quadratic_control = null;
        break;
      }

      case SVGPathData.VERT_LINE_TO: {
        const { y } = command;
        if (last_point) {
          current_idx = vne.addVertex([last_point[0], y], current_idx);
          pushSegmentMeta({ source_verb: "V" });
        }
        last_point = [last_point ? last_point[0] : 0, y];
        last_quadratic_control = null;
        break;
      }

      case SVGPathData.CURVE_TO: {
        const { x, y } = command;
        if (last_point) {
          const ta: cmath.Vector2 = [
            command.x1 - last_point[0],
            command.y1 - last_point[1],
          ];
          const tb: cmath.Vector2 = [command.x2 - x, command.y2 - y];
          current_idx = vne.addVertex([x, y], current_idx, ta, tb);
          pushSegmentMeta({ source_verb: "C" });
        }
        last_point = [x, y];
        last_quadratic_control = null;
        break;
      }

      case SVGPathData.SMOOTH_CURVE_TO: {
        const { x, y, x2, y2 } = command;
        if (last_point) {
          const ta = vne.getNextMirroredTangent(current_idx);
          const tb: cmath.Vector2 = [x2 - x, y2 - y];
          current_idx = vne.addVertex([x, y], current_idx, ta, tb);
          pushSegmentMeta({ source_verb: "S" });
        }
        last_point = [x, y];
        last_quadratic_control = null;
        break;
      }

      case SVGPathData.QUAD_TO: {
        if (last_point) {
          const control: cmath.Vector2 = [command.x1, command.y1];
          const end: cmath.Vector2 = [command.x, command.y];
          const ta: cmath.Vector2 = [
            (2 / 3) * (control[0] - last_point[0]),
            (2 / 3) * (control[1] - last_point[1]),
          ];
          const tb: cmath.Vector2 = [
            (2 / 3) * (control[0] - end[0]),
            (2 / 3) * (control[1] - end[1]),
          ];
          current_idx = vne.addVertex(end, current_idx, ta, tb);
          pushSegmentMeta({ source_verb: "Q" });
          last_point = end;
          last_quadratic_control = control;
        }
        break;
      }

      case SVGPathData.SMOOTH_QUAD_TO: {
        if (last_point) {
          const end: cmath.Vector2 = [command.x, command.y];
          const control: cmath.Vector2 = last_quadratic_control
            ? [
                2 * last_point[0] - last_quadratic_control[0],
                2 * last_point[1] - last_quadratic_control[1],
              ]
            : [last_point[0], last_point[1]];
          const ta: cmath.Vector2 = [
            (2 / 3) * (control[0] - last_point[0]),
            (2 / 3) * (control[1] - last_point[1]),
          ];
          const tb: cmath.Vector2 = [
            (2 / 3) * (control[0] - end[0]),
            (2 / 3) * (control[1] - end[1]),
          ];
          current_idx = vne.addVertex(end, current_idx, ta, tb);
          pushSegmentMeta({ source_verb: "T" });
          last_point = end;
          last_quadratic_control = control;
        }
        break;
      }

      case SVGPathData.ARC: {
        const { rX, rY, xRot, lArcFlag, sweepFlag, x, y } = command;
        if (last_point) {
          const [x1, y1] = last_point;
          const curves = cmath.bezier.a2c(
            x1,
            y1,
            rX,
            rY,
            xRot,
            lArcFlag,
            sweepFlag,
            x,
            y
          );

          const seg_count = curves.length / 6;
          const group_id = ++arc_group_seq;
          let current_point: cmath.Vector2 = last_point;
          let seq = 0;

          for (let i = 0; i < curves.length; i += 6) {
            const [cx1, cy1, cx2, cy2, ex, ey] = curves.slice(i, i + 6);
            const end_point: cmath.Vector2 = [ex, ey];
            const ta: cmath.Vector2 = [
              cx1 - current_point[0],
              cy1 - current_point[1],
            ];
            const tb: cmath.Vector2 = [cx2 - end_point[0], cy2 - end_point[1]];
            // Use vne.addVertex with origin so the segment is created in lock-step.
            current_idx = vne.addVertex(end_point, current_idx, ta, tb);
            const is_last = seq === seg_count - 1;
            pushSegmentMeta({
              source_verb: "A",
              arc: {
                group_id,
                rx: rX,
                ry: rY,
                x_rot: xRot,
                large_arc_flag: lArcFlag as 0 | 1,
                sweep_flag: sweepFlag as 0 | 1,
                baseline_ta: [ta[0], ta[1]],
                baseline_tb: [tb[0], tb[1]],
                baseline_b_abs: [end_point[0], end_point[1]],
                seq,
                count: seg_count,
                original_end: is_last ? [x, y] : undefined,
              },
            });
            current_point = end_point;
            seq++;
          }
          last_point = current_point;
        }
        last_quadratic_control = null;
        break;
      }

      case SVGPathData.CLOSE_PATH: {
        if (
          current_idx !== -1 &&
          subpath_start_idx !== -1 &&
          current_idx !== subpath_start_idx
        ) {
          vne.addSegment(current_idx, subpath_start_idx);
          pushSegmentMeta({ source_verb: "Z", is_close_segment: true });
          // After Z, the current point is logically at the subpath start.
          current_idx = subpath_start_idx;
          last_point = vne.vertices[subpath_start_idx];
        } else if (
          current_idx !== -1 &&
          current_idx === subpath_start_idx &&
          meta.length > 0
        ) {
          // The previous segment already topologically closed the subpath
          // (the last segment ended at the same vertex M started at).
          // Tag that segment as a close-segment so the emitter writes Z.
          // We only do this if the last segment's `b` is subpath_start_idx —
          // which it must be, since current_idx === subpath_start_idx and the
          // last operation that brought us here landed b at current_idx.
          const last_seg = vne.segments[vne.segments.length - 1];
          if (last_seg && last_seg.b === subpath_start_idx) {
            meta[meta.length - 1] = {
              ...meta[meta.length - 1],
              is_close_segment: true,
            };
          }
        }
        last_quadratic_control = null;
        break;
      }

      default:
        throw new Error(`Unsupported path command type: ${type}`);
    }
  }

  return { network: vne.value, meta };
}

// ─── Emitter ───────────────────────────────────────────────────────────────

const EPSILON = 1e-9;

function approxEqual(a: number, b: number, eps = EPSILON): boolean {
  return Math.abs(a - b) <= eps;
}

function vec2Equal(
  a: readonly [number, number],
  b: readonly [number, number],
  eps = EPSILON
): boolean {
  return approxEqual(a[0], b[0], eps) && approxEqual(a[1], b[1], eps);
}

function isZeroTangent(t: readonly [number, number]): boolean {
  return approxEqual(t[0], 0) && approxEqual(t[1], 0);
}

/**
 * Returns true iff the segment's tangents are consistent with a single
 * quadratic Bézier control point at ratio 2/3 (i.e. the segment was emitted
 * from a `Q` or `T` command and has not been edited).
 *
 * For a quadratic with start=A, end=B, control=C:
 *   ta = 2/3 * (C - A)  =>  C = A + (3/2) * ta
 *   tb = 2/3 * (C - B)  =>  C = B + (3/2) * tb
 * Both must yield the same C.
 */
function tangentsRepresentQuadratic(
  a: readonly [number, number],
  b: readonly [number, number],
  ta: readonly [number, number],
  tb: readonly [number, number]
): { ok: true; control: cmath.Vector2 } | { ok: false } {
  const c_from_a: cmath.Vector2 = [a[0] + 1.5 * ta[0], a[1] + 1.5 * ta[1]];
  const c_from_b: cmath.Vector2 = [b[0] + 1.5 * tb[0], b[1] + 1.5 * tb[1]];
  if (vec2Equal(c_from_a, c_from_b, 1e-6)) {
    return { ok: true, control: c_from_a };
  }
  return { ok: false };
}

/**
 * Returns true iff `ta` mirrors the previous segment's `tb` (i.e. the
 * vertex is a smooth join — what `S`/`T` commands require).
 *
 * For `ta` at vertex V (segment a=V) to mirror previous segment's `tb`
 * (whose b=V), we need: ta == -prev.tb (both expressed relative to V).
 */
function isSmoothJoin(
  prev_tb: readonly [number, number],
  curr_ta: readonly [number, number]
): boolean {
  return vec2Equal([curr_ta[0], curr_ta[1]], [-prev_tb[0], -prev_tb[1]], 1e-6);
}

/**
 * Determines whether an arc-group's segments are byte-equal to their parse-
 * time baselines. If any segment in the group has been edited (vertex moved,
 * tangent changed), the entire arc must be promoted to C.
 */
function isArcGroupUnchanged(
  segments: ReadonlyArray<vn.VectorNetworkSegment>,
  meta: ReadonlyArray<SegmentMeta>,
  vertices: ReadonlyArray<readonly [number, number]>,
  group_id: number
): boolean {
  for (let i = 0; i < segments.length; i++) {
    const m = meta[i];
    if (m?.arc?.group_id !== group_id) continue;
    const seg = segments[i];
    if (!vec2Equal(seg.ta, m.arc.baseline_ta)) return false;
    if (!vec2Equal(seg.tb, m.arc.baseline_tb)) return false;
    if (!vec2Equal(vertices[seg.b], m.arc.baseline_b_abs)) return false;
  }
  return true;
}

function emitWithVerbs(
  network: vn.VectorNetwork,
  meta: ReadonlyArray<SegmentMeta>
): string {
  const { vertices, segments } = network;
  if (segments.length === 0) return "";

  const commands: SVGCommand[] = [];

  // Cache arc-unchanged decisions per group to avoid repeated scans.
  const arc_unchanged: Map<number, boolean> = new Map();
  const arcStillValid = (group_id: number): boolean => {
    const cached = arc_unchanged.get(group_id);
    if (cached !== undefined) return cached;
    const ok = isArcGroupUnchanged(segments, meta, vertices, group_id);
    arc_unchanged.set(group_id, ok);
    return ok;
  };

  let current_start: number | null = null;
  let previous_end: number | null = null;
  // Track the tb of the most recently emitted curve-like segment (used for S/T predecessor check).
  let prev_segment_tb: readonly [number, number] | null = null;
  /** When true, the previous segment was emitted as a quadratic (Q or T) and `prev_quad_control` is valid. */
  let prev_quad_control: cmath.Vector2 | null = null;

  /** Skip the next K iterations because we already emitted an arc for them. */
  let skip_to_index = -1;

  for (let i = 0; i < segments.length; i++) {
    if (i < skip_to_index) continue;

    const segment = segments[i];
    const m = meta[i] ?? {};
    const { a, b, ta, tb } = segment;
    const start = vertices[a];
    const end = vertices[b];

    // Start a new subpath if this segment doesn't connect to the previous end.
    if (previous_end !== a) {
      commands.push({
        type: SVGPathData.MOVE_TO,
        x: start[0],
        y: start[1],
        relative: false,
      });
      current_start = a;
      prev_segment_tb = null;
      prev_quad_control = null;
    }

    const is_straight = isZeroTangent(ta) && isZeroTangent(tb);
    const is_closing =
      m.is_close_segment === true &&
      current_start !== null &&
      b === current_start;

    // ─── Arc preservation (multi-segment group) ────────────────────────────
    if (m.arc && m.source_verb === "A" && arcStillValid(m.arc.group_id)) {
      // Emit one A command spanning the entire arc group, then skip the rest.
      // Find the last segment of this group (consecutive in segments[]).
      let last_idx = i;
      while (
        last_idx + 1 < segments.length &&
        meta[last_idx + 1]?.arc?.group_id === m.arc.group_id
      ) {
        last_idx++;
      }
      const last_seg = segments[last_idx];
      const last_meta = meta[last_idx];
      // Prefer the original `(x, y)` from the SVG command (preserves byte
      // equality across arc-to-cubic decomposition's floating-point drift).
      // Fall back to the current vertex if the original isn't recorded.
      const last_end = last_meta?.arc?.original_end ?? vertices[last_seg.b];
      commands.push({
        type: SVGPathData.ARC,
        rX: m.arc.rx,
        rY: m.arc.ry,
        xRot: m.arc.x_rot,
        lArcFlag: m.arc.large_arc_flag,
        sweepFlag: m.arc.sweep_flag,
        x: last_end[0],
        y: last_end[1],
        relative: false,
      });
      previous_end = last_seg.b;
      prev_segment_tb = last_seg.tb;
      prev_quad_control = null;
      skip_to_index = last_idx + 1;
      continue;
    }

    // ─── Close-segment (Z) — straight case ─────────────────────────────────
    // When the segment is a dedicated straight closing segment (e.g. the
    // `Z` handler added it as a line back to subpath start), emit Z. This
    // replaces the L/C emission. The curved-closing case is handled later:
    // we emit the curve normally and then append Z to preserve the
    // closed-subpath marker semantic.
    if (is_closing && is_straight) {
      commands.push({ type: SVGPathData.CLOSE_PATH });
      previous_end = null;
      current_start = null;
      prev_segment_tb = null;
      prev_quad_control = null;
      continue;
    }

    // ─── Straight segment (L/H/V) ──────────────────────────────────────────
    if (is_straight) {
      // Prefer the recorded verb if its shape still applies.
      if (m.source_verb === "H" && approxEqual(end[1], start[1])) {
        commands.push({
          type: SVGPathData.HORIZ_LINE_TO,
          x: end[0],
          relative: false,
        });
      } else if (m.source_verb === "V" && approxEqual(end[0], start[0])) {
        commands.push({
          type: SVGPathData.VERT_LINE_TO,
          y: end[1],
          relative: false,
        });
      } else {
        commands.push({
          type: SVGPathData.LINE_TO,
          x: end[0],
          y: end[1],
          relative: false,
        });
      }
      previous_end = b;
      prev_segment_tb = tb;
      prev_quad_control = null;
      if (current_start !== null && b === current_start) {
        // Implicit close: a non-Z-tagged segment that happens to close back.
        // Don't emit Z; the segment we just emitted draws the closing line
        // explicitly. (Matches vn.toSVGPathData behavior for non-Z closes.)
      }
      continue;
    }

    // ─── Curve emission (Q, T, S, or fallback C) ───────────────────────────
    let emitted = false;

    // Quadratic (Q/T)
    if (!emitted && (m.source_verb === "Q" || m.source_verb === "T")) {
      const quad = tangentsRepresentQuadratic(start, end, ta, tb);
      if (quad.ok) {
        // T is valid iff the new control is the reflection of the previous
        // control across the current start point: (C2 - P) === (P - C1).
        // (Same vector, NOT negated — that's the S-cubic rule, where ta/tb
        // are both relative to the same vertex.)
        const t_valid =
          m.source_verb === "T" &&
          prev_quad_control !== null &&
          vec2Equal(
            [start[0] - prev_quad_control[0], start[1] - prev_quad_control[1]],
            [quad.control[0] - start[0], quad.control[1] - start[1]],
            1e-6
          );
        if (t_valid) {
          commands.push({
            type: SVGPathData.SMOOTH_QUAD_TO,
            x: end[0],
            y: end[1],
            relative: false,
          });
        } else {
          commands.push({
            type: SVGPathData.QUAD_TO,
            x1: quad.control[0],
            y1: quad.control[1],
            x: end[0],
            y: end[1],
            relative: false,
          });
        }
        previous_end = b;
        prev_segment_tb = tb;
        prev_quad_control = quad.control;
        emitted = true;
      }
      // Quadratic shape broken → fall through to S/C.
    }

    // Smooth cubic (S)
    if (
      !emitted &&
      m.source_verb === "S" &&
      prev_segment_tb !== null &&
      isSmoothJoin(prev_segment_tb, ta)
    ) {
      const c2: cmath.Vector2 = [end[0] + tb[0], end[1] + tb[1]];
      commands.push({
        type: SVGPathData.SMOOTH_CURVE_TO,
        x2: c2[0],
        y2: c2[1],
        x: end[0],
        y: end[1],
        relative: false,
      });
      previous_end = b;
      prev_segment_tb = tb;
      prev_quad_control = null;
      emitted = true;
    }

    // Cubic (C) — fallback
    if (!emitted) {
      const c1: cmath.Vector2 = [start[0] + ta[0], start[1] + ta[1]];
      const c2: cmath.Vector2 = [end[0] + tb[0], end[1] + tb[1]];
      commands.push({
        type: SVGPathData.CURVE_TO,
        x1: c1[0],
        y1: c1[1],
        x2: c2[0],
        y2: c2[1],
        x: end[0],
        y: end[1],
        relative: false,
      });
      previous_end = b;
      prev_segment_tb = tb;
      prev_quad_control = null;
    }

    // After emitting a curved segment that happens to be the close marker
    // (e.g. `M ... Q 0 2 0 0 Z` — the Q reaches subpath start, the Z marks
    // closure), append a Z command to preserve the closed-subpath semantic.
    if (is_closing && !is_straight) {
      commands.push({ type: SVGPathData.CLOSE_PATH });
      previous_end = null;
      current_start = null;
      prev_segment_tb = null;
      prev_quad_control = null;
    }
  }

  return encodeSVGPath(commands);
}

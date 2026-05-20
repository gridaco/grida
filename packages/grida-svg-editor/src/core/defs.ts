// Defs (resource) registries.
//
// v1 ships only `gradients` as a typed registry. The other SVG <defs> kinds
// (patterns, symbols, markers, clip-paths, masks, filters) are deferred —
// consumers needing them at v1 walk `<defs>` via `editor.document` directly.

import type {
  GradientDefinition,
  GradientEntry,
  GradientStop,
  LinearGradientDefinition,
  NodeId,
  RadialGradientDefinition,
  Unsubscribe,
} from "../types";
import { array_shallow_equal } from "../util/equal";
import type { SvgDocument } from "./document";

export interface GradientsApi {
  list(): ReadonlyArray<GradientEntry>;
  get(id: string): GradientEntry | null;
  upsert(definition: GradientDefinition, opts?: { id?: string }): string;
  remove(id: string): void;
  subscribe(fn: (entries: ReadonlyArray<GradientEntry>) => void): Unsubscribe;
}

// ─── Gradients implementation ──────────────────────────────────────────────

export class GradientsRegistry implements GradientsApi {
  private listeners = new Set<(e: ReadonlyArray<GradientEntry>) => void>();
  private counter = 0;

  // Memoization cache. `list()` returns a referentially stable array
  // until the document's structure changes (gradient added / removed)
  // or until one of the cached entries' definition / ref_count differs
  // from the rebuild. Consumers can plug `list()` straight into
  // `useSyncExternalStore` with `Object.is` comparison.
  private _cached: ReadonlyArray<GradientEntry> | null = null;
  private _cached_by_id = new Map<string, GradientEntry>();
  private _dirty = true;

  constructor(private readonly doc: SvgDocument) {
    // Refresh subscribers whenever the document changes — gradient defs may
    // have been edited externally (load, undo).
    doc.on_change(() => {
      this._dirty = true;
      this.emit();
    });
  }

  list(): ReadonlyArray<GradientEntry> {
    if (!this._dirty && this._cached) return this._cached;
    const out: GradientEntry[] = [];
    let any_change = !this._cached;
    const seen = new Set<string>();
    const defs = this.find_defs_elements();
    for (const def_id of defs) {
      for (const child of this.doc.element_children_of(def_id)) {
        const tag = this.doc.tag_of(child);
        if (tag === "linearGradient" || tag === "radialGradient") {
          const id = this.doc.get_attr(child, "id");
          if (!id) continue;
          const definition = this.read_gradient(child, tag);
          if (!definition) continue;
          const ref_count = this.count_refs(id);
          const prev = this._cached_by_id.get(id);
          if (
            prev &&
            prev.ref_count === ref_count &&
            gradient_definition_equals(prev.definition, definition)
          ) {
            out.push(prev);
          } else {
            const entry: GradientEntry = { id, definition, ref_count };
            this._cached_by_id.set(id, entry);
            out.push(entry);
            any_change = true;
          }
          seen.add(id);
        }
      }
    }
    // Drop dropped entries from the per-id pool.
    for (const id of this._cached_by_id.keys()) {
      if (!seen.has(id)) {
        this._cached_by_id.delete(id);
        any_change = true;
      }
    }
    if (!any_change && this._cached && array_shallow_equal(this._cached, out)) {
      this._dirty = false;
      return this._cached;
    }
    const frozen = Object.freeze(out) as ReadonlyArray<GradientEntry>;
    this._cached = frozen;
    this._dirty = false;
    return frozen;
  }

  get(id: string): GradientEntry | null {
    return this.list().find((g) => g.id === id) ?? null;
  }

  upsert(definition: GradientDefinition, opts?: { id?: string }): string {
    const existing_id = opts?.id;
    if (existing_id) {
      const node = this.find_gradient_node(existing_id);
      if (node !== null) {
        this.write_gradient(node, definition);
        return existing_id;
      }
    }
    // Create new under <defs>.
    const id = existing_id ?? this.fresh_id();
    const defs_id = this.ensure_defs();
    const tag =
      definition.kind === "linear" ? "linearGradient" : "radialGradient";
    const new_id = this.doc.create_element(tag, {
      ns: "http://www.w3.org/2000/svg",
    });
    this.doc.set_attr(new_id, "id", id);
    this.doc.insert(new_id, defs_id, null);
    this.write_gradient(new_id, definition);
    this.emit();
    return id;
  }

  remove(id: string): void {
    const refs = this.count_refs(id);
    if (refs > 0) {
      throw new Error(
        `[svg-editor] cannot remove gradient "${id}": ${refs} node(s) still reference it`
      );
    }
    const node = this.find_gradient_node(id);
    if (node !== null) {
      this.doc.remove(node);
      this.emit();
    }
  }

  subscribe(fn: (entries: ReadonlyArray<GradientEntry>) => void): Unsubscribe {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    const snap = this.list();
    for (const fn of this.listeners) fn(snap);
  }

  private fresh_id(): string {
    let id: string;
    do {
      id = `g${++this.counter}`;
    } while (this.find_gradient_node(id) !== null);
    return id;
  }

  private find_defs_elements(): NodeId[] {
    return this.doc.find_by_tag(this.doc.root, "defs") as NodeId[];
  }

  private ensure_defs(): NodeId {
    const existing = this.find_defs_elements();
    if (existing.length > 0) return existing[0];
    const defs = this.doc.create_element("defs", {
      ns: "http://www.w3.org/2000/svg",
    });
    // Insert as first child of root.
    const first = this.doc.children_of(this.doc.root)[0] ?? null;
    this.doc.insert(defs, this.doc.root, first);
    return defs;
  }

  private find_gradient_node(id: string): NodeId | null {
    for (const def of this.find_defs_elements()) {
      for (const child of this.doc.element_children_of(def)) {
        if (this.doc.get_attr(child, "id") === id) {
          const tag = this.doc.tag_of(child);
          if (tag === "linearGradient" || tag === "radialGradient") {
            return child;
          }
        }
      }
    }
    return null;
  }

  private read_gradient(
    id: NodeId,
    tag: "linearGradient" | "radialGradient"
  ): GradientDefinition | null {
    const stops: GradientStop[] = [];
    for (const child of this.doc.element_children_of(id)) {
      if (this.doc.tag_of(child) !== "stop") continue;
      const offset = parseFloat(this.doc.get_attr(child, "offset") ?? "0");
      const color =
        this.doc.get_attr(child, "stop-color") ??
        this.doc.get_style(child, "stop-color") ??
        "#000000";
      const opacity_str =
        this.doc.get_attr(child, "stop-opacity") ??
        this.doc.get_style(child, "stop-opacity");
      const opacity =
        opacity_str !== null ? parseFloat(opacity_str) : undefined;
      stops.push({
        offset,
        color,
        ...(opacity !== undefined ? { opacity } : {}),
      });
    }
    const gu = this.doc.get_attr(id, "gradientUnits");
    const gradient_units:
      | "user_space_on_use"
      | "object_bounding_box"
      | undefined =
      gu === "userSpaceOnUse"
        ? "user_space_on_use"
        : gu === "objectBoundingBox"
          ? "object_bounding_box"
          : undefined;
    const sm = this.doc.get_attr(id, "spreadMethod");
    const spread_method: "pad" | "reflect" | "repeat" | undefined =
      sm === "pad" || sm === "reflect" || sm === "repeat" ? sm : undefined;
    const num = (n: string) => {
      const v = this.doc.get_attr(id, n);
      return v !== null ? parseFloat(v) : undefined;
    };
    if (tag === "linearGradient") {
      const def: LinearGradientDefinition = {
        kind: "linear",
        stops,
        x1: num("x1"),
        y1: num("y1"),
        x2: num("x2"),
        y2: num("y2"),
        gradient_units,
        spread_method,
      };
      return def;
    }
    const def: RadialGradientDefinition = {
      kind: "radial",
      stops,
      cx: num("cx"),
      cy: num("cy"),
      r: num("r"),
      fx: num("fx"),
      fy: num("fy"),
      gradient_units,
      spread_method,
    };
    return def;
  }

  private write_gradient(node: NodeId, def: GradientDefinition) {
    // Clear existing children, then write fresh stops. Snapshot the
    // children list because `remove` splices the live array.
    for (const c of this.doc.children_of(node).slice()) {
      this.doc.remove(c);
    }
    const set_num = (name: string, v: number | undefined) => {
      this.doc.set_attr(node, name, v === undefined ? null : String(v));
    };
    if (def.kind === "linear") {
      set_num("x1", def.x1);
      set_num("y1", def.y1);
      set_num("x2", def.x2);
      set_num("y2", def.y2);
    } else {
      set_num("cx", def.cx);
      set_num("cy", def.cy);
      set_num("r", def.r);
      set_num("fx", def.fx);
      set_num("fy", def.fy);
    }
    if (def.gradient_units) {
      this.doc.set_attr(
        node,
        "gradientUnits",
        def.gradient_units === "user_space_on_use"
          ? "userSpaceOnUse"
          : "objectBoundingBox"
      );
    }
    if (def.spread_method) {
      this.doc.set_attr(node, "spreadMethod", def.spread_method);
    }
    for (const stop of def.stops) {
      const stop_id = this.doc.create_element("stop", {
        ns: "http://www.w3.org/2000/svg",
      });
      this.doc.set_attr(stop_id, "offset", String(stop.offset));
      this.doc.set_attr(stop_id, "stop-color", stop.color);
      if (stop.opacity !== undefined) {
        this.doc.set_attr(stop_id, "stop-opacity", String(stop.opacity));
      }
      this.doc.insert(stop_id, node, null);
    }
  }

  private count_refs(id: string): number {
    let count = 0;
    const pattern = new RegExp(
      `url\\(\\s*["']?#${escape_regex(id)}["']?\\s*\\)`
    );
    for (const node of this.doc.all_elements()) {
      const fill = this.doc.get_attr(node, "fill");
      const stroke = this.doc.get_attr(node, "stroke");
      const style_fill = this.doc.get_style(node, "fill");
      const style_stroke = this.doc.get_style(node, "stroke");
      for (const v of [fill, stroke, style_fill, style_stroke]) {
        if (v && pattern.test(v)) count++;
      }
    }
    return count;
  }
}

function escape_regex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Equality helpers (private; backs the GradientsRegistry cache) ────────

function gradient_definition_equals(
  a: GradientDefinition,
  b: GradientDefinition
): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind) return false;
  if (a.stops.length !== b.stops.length) return false;
  for (let i = 0; i < a.stops.length; i++) {
    const sa = a.stops[i];
    const sb = b.stops[i];
    if (
      sa.offset !== sb.offset ||
      sa.color !== sb.color ||
      sa.opacity !== sb.opacity
    )
      return false;
  }
  if (a.kind === "linear" && b.kind === "linear") {
    return (
      a.x1 === b.x1 &&
      a.y1 === b.y1 &&
      a.x2 === b.x2 &&
      a.y2 === b.y2 &&
      a.gradient_units === b.gradient_units &&
      a.spread_method === b.spread_method
    );
  }
  if (a.kind === "radial" && b.kind === "radial") {
    return (
      a.cx === b.cx &&
      a.cy === b.cy &&
      a.r === b.r &&
      a.fx === b.fx &&
      a.fy === b.fy &&
      a.gradient_units === b.gradient_units &&
      a.spread_method === b.spread_method
    );
  }
  return false;
}

export type Defs = {
  gradients: GradientsApi;
};

export function create_defs(doc: SvgDocument): Defs {
  return {
    gradients: new GradientsRegistry(doc),
  };
}

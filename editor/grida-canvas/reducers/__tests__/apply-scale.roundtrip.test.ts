import reducer, { type ReducerContext } from "../index";
import type { Action } from "../../action";
import { editor } from "@/grida-canvas";
import grida from "@grida/schema";
import { io } from "@grida/io";
import * as fs from "fs";
import * as path from "path";

/**
 * Fixture support note:
 * This test currently targets the Grida schema version specifier `20251209`
 * (e.g. `0.0.4-beta+20251209`) and loads all `*-20251209.grida` fixtures.
 */
const FIXTURE_VERSION_SPECIFIER = "20251209";

function deepClone<T>(v: T): T {
  // structuredClone is available in modern runtimes, but keep a fallback for Jest.
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return structuredClone(v);
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.parse(JSON.stringify(v)) as T;
  }
}

function approxEqual(a: unknown, b: unknown, eps = 1e-9): boolean {
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
    return Math.abs(a - b) <= eps;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!approxEqual(a[i], b[i], eps)) return false;
    }
    return true;
  }
  if (
    a &&
    b &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const ak = Object.keys(a as Record<string, unknown>).sort();
    const bk = Object.keys(b as Record<string, unknown>).sort();
    if (ak.length !== bk.length) return false;
    for (let i = 0; i < ak.length; i++) {
      if (ak[i] !== bk[i]) return false;
    }
    for (const k of ak) {
      const av = (a as any)[k];
      const bv = (b as any)[k];
      if (!approxEqual(av, bv, eps)) return false;
    }
    return true;
  }
  return a === b;
}

function firstMismatch(
  a: unknown,
  b: unknown,
  eps = 1e-9,
  path: string[] = []
): { path: string; a: unknown; b: unknown } | null {
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return null;
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return a === b ? null : { path: path.join("."), a, b };
    }
    return Math.abs(a - b) <= eps ? null : { path: path.join("."), a, b };
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return { path: path.join("."), a, b };
    for (let i = 0; i < a.length; i++) {
      const m = firstMismatch(a[i], b[i], eps, [...path, String(i)]);
      if (m) return m;
    }
    return null;
  }
  if (
    a &&
    b &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const ak = Object.keys(a as Record<string, unknown>).sort();
    const bk = Object.keys(b as Record<string, unknown>).sort();
    if (ak.length !== bk.length) return { path: path.join("."), a, b };
    for (let i = 0; i < ak.length; i++) {
      if (ak[i] !== bk[i]) return { path: path.join("."), a, b };
    }
    for (const k of ak) {
      const m = firstMismatch((a as any)[k], (b as any)[k], eps, [...path, k]);
      if (m) return m;
    }
    return null;
  }
  return a === b ? null : { path: path.join("."), a, b };
}

// Minimal geometry stub that derives absolute rects from authored box geometry.
// This is intentionally simple: all test nodes use position: "absolute" and
// numeric left/top/width/height so geometry is deterministic.
function createGeometryStub(
  getState: () => editor.state.IEditorState
): editor.api.IDocumentGeometryQuery | any {
  function parentMapFromLinks(
    links: Record<string, string[]>
  ): Record<string, string> {
    const map: Record<string, string> = {};
    for (const [parent, children] of Object.entries(links)) {
      for (const child of children) {
        map[child] = parent;
      }
    }
    return map;
  }

  function getLocalRect(
    node: any
  ): { x: number; y: number; width: number; height: number } | null {
    if (!node) return null;
    if (node.position !== "absolute") return null;
    if (typeof node.left !== "number") return null;
    if (typeof node.top !== "number") return null;

    // Many real-world text nodes are authored with `width/height: "auto"`.
    // The real editor geometry provider measures the rendered box; for tests
    // we use a deterministic linear approximation so scale round-trips can be
    // exercised without DOM measurement.
    if (node.type === "text" && typeof node.font_size === "number") {
      const text = typeof node.text === "string" ? node.text : "";
      const w =
        typeof node.width === "number"
          ? node.width
          : Math.max(1, text.length) * node.font_size * 0.6;
      const h =
        typeof node.height === "number" ? node.height : node.font_size * 1.2;
      return { x: node.left, y: node.top, width: w, height: h };
    }

    if (typeof node.width !== "number") return null;
    if (typeof node.height !== "number") return null;
    return {
      x: node.left,
      y: node.top,
      width: node.width,
      height: node.height,
    };
  }

  function getAbsRect(node_id: string) {
    const state = getState();
    const node = (state.document.nodes as any)[node_id];
    const local = getLocalRect(node);
    if (!local) return null;

    const parents = parentMapFromLinks(state.document.links as any);
    let x = local.x;
    let y = local.y;
    let p = parents[node_id];

    while (p && p !== state.scene_id) {
      const pn = (state.document.nodes as any)[p];
      const pl = getLocalRect(pn);
      if (pl) {
        x += pl.x;
        y += pl.y;
      }
      p = parents[p];
    }

    return { x, y, width: local.width, height: local.height };
  }

  return {
    getNodeIdsFromPoint: () => [],
    getNodeIdsFromPointerEvent: () => [],
    getNodeIdsFromEnvelope: () => [],
    getNodeAbsoluteBoundingRect: (id: string) => getAbsRect(id),
    getNodeAbsoluteRotation: () => 0,
  } satisfies editor.api.IDocumentGeometryQuery;
}

function createContext(
  getState: () => editor.state.IEditorState
): ReducerContext {
  return {
    geometry: createGeometryStub(getState),
    vector: undefined,
    viewport: { width: 1000, height: 1000 },
    backend: "dom",
    paint_constraints: { fill: "fill", stroke: "stroke" },
    idgen: grida.id.noop.generator,
  };
}

function dispatch(
  state: editor.state.IEditorState,
  action: Action,
  context: ReducerContext
): editor.state.IEditorState {
  const [next] = reducer(state, action, context);
  return next;
}

function listFixturePathsByVersionSpecifier(
  versionSpecifier: string
): string[] {
  // Keep this scoped to fixtures/test-grida (see fixtures/test-grida/README.md)
  // to avoid crawling huge fixture trees (fonts/images/etc).
  const dir = path.resolve(__dirname, "../../../../fixtures/test-grida");
  const suffix = `-${versionSpecifier}.grida`;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(suffix))
    .map((e) => path.join(dir, e.name))
    .sort((a, b) => a.localeCompare(b));
}

function loadFixtureDocument(fixturePath: string): {
  scene_id: string;
  document: grida.program.document.Document;
} {
  const buf = fs.readFileSync(fixturePath);
  const unpacked = io.archive.unpack(new Uint8Array(buf));
  const model = unpacked.document; // JSONDocumentFileModel
  const scene_id =
    model.document.entry_scene_id ?? model.document.scenes_ref?.[0];
  if (!scene_id) throw new Error("fixture document has no entry_scene_id");
  return {
    scene_id,
    document: model.document,
  };
}

function initEditorStateFromFixture(args: {
  scene_id: string;
  document: grida.program.document.Document;
}): editor.state.IEditorState {
  let state = editor.state.init({
    editable: true,
    debug: false,
    document: args.document,
    templates: {},
  });
  state = dispatch(
    state,
    { type: "load", scene: args.scene_id } as any,
    createContext(() => state)
  );
  return state;
}

function hasNumericAbsoluteBox(node: any): boolean {
  return (
    node?.position === "absolute" &&
    typeof node.left === "number" &&
    typeof node.top === "number" &&
    typeof node.width === "number" &&
    typeof node.height === "number"
  );
}

function getDescendants(
  links: Record<string, string[]>,
  root_id: string
): string[] {
  const out: string[] = [];
  const stack = [...(links[root_id] ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    const children = links[id];
    if (children?.length) stack.push(...children);
  }
  return out;
}

function getRootContainerIds(doc: grida.program.document.Document): string[] {
  const nodes = doc.nodes as Record<string, any>;
  const links = doc.links as Record<string, string[]>;
  const scene_id = doc.entry_scene_id ?? doc.scenes_ref?.[0];
  if (!scene_id) throw new Error("fixture document has no entry scene id");
  const rootChildren = links[scene_id] ?? [];
  return rootChildren.filter((id) => nodes[id]?.type === "container");
}

function pickTextAndVectorTargetsFromFixture(
  doc: grida.program.document.Document
): {
  text_id: string | null;
  vector_id: string | null;
} {
  const nodes = doc.nodes as Record<string, any>;
  const scene_id = doc.entry_scene_id ?? doc.scenes_ref[0];
  if (!scene_id) throw new Error("fixture document has no entry scene id");

  const entries = Object.entries(nodes).filter(([id]) => id !== scene_id);

  const text_id =
    entries.find(
      ([, n]) =>
        n.type === "text" &&
        n.position === "absolute" &&
        typeof n.left === "number" &&
        typeof n.top === "number" &&
        typeof n.font_size === "number"
    )?.[0] ?? null;
  const vector_id =
    entries.find(
      ([, n]) =>
        n.type === "vector" && hasNumericAbsoluteBox(n) && n.vector_network
    )?.[0] ?? null;

  return { text_id, vector_id };
}

function isScaleTrackableNode(node: any): boolean {
  if (!node) return false;
  if (node.type === "text") {
    return (
      node.position === "absolute" &&
      typeof node.left === "number" &&
      typeof node.top === "number" &&
      typeof node.font_size === "number"
    );
  }
  if (!hasNumericAbsoluteBox(node)) return false;
  return node.type === "container" || node.type === "vector";
}

function getTrackableSubtreeNodeIds(args: {
  doc: grida.program.document.Document;
  root_id: string;
}): string[] {
  const nodes = args.doc.nodes as Record<string, any>;
  const links = args.doc.links as Record<string, string[]>;
  const descendants = getDescendants(links, args.root_id);
  return [args.root_id, ...descendants].filter((id) =>
    isScaleTrackableNode(nodes[id])
  );
}

function applyScaleOnce(
  state: editor.state.IEditorState,
  context: ReducerContext,
  args: {
    targets: string[];
    factor: number;
    origin: "center";
    include_subtree: boolean;
  }
) {
  return dispatch(
    state,
    {
      type: "apply-scale",
      targets: args.targets,
      factor: args.factor,
      origin: args.origin,
      include_subtree: args.include_subtree,
    },
    context
  );
}

describe("apply-scale round-trip (accuracy)", () => {
  const fixturePaths = listFixturePathsByVersionSpecifier(
    FIXTURE_VERSION_SPECIFIER
  );

  if (!fixturePaths.length) {
    throw new Error(
      `No fixtures found matching *-${FIXTURE_VERSION_SPECIFIER}.grida under fixtures/test-grida`
    );
  }

  describe.each(fixturePaths.map((p) => [path.basename(p), p] as const))(
    "fixture: %s",
    (_fixtureName, fixturePath) => {
      const { scene_id, document } = loadFixtureDocument(fixturePath);
      const { text_id, vector_id } =
        pickTextAndVectorTargetsFromFixture(document);
      const root_container_ids = getRootContainerIds(document);

      if (!root_container_ids.length) {
        throw new Error(
          `fixture ${path.basename(fixturePath)} has no root containers`
        );
      }

      const itIf = (cond: unknown) => (cond ? it : it.skip);

      itIf(text_id)(
        "text node round-trips for 0.01x then 100x (epsilon on numbers)",
        () => {
          const tid = text_id!;
          let state = initEditorStateFromFixture({ scene_id, document });
          const initial = deepClone(state.document.nodes[tid]);

          const ctx = createContext(() => state);
          state = applyScaleOnce(state, ctx, {
            targets: [tid],
            factor: 0.01,
            origin: "center",
            include_subtree: false,
          });
          state = applyScaleOnce(state, ctx, {
            targets: [tid],
            factor: 100,
            origin: "center",
            include_subtree: false,
          });

          const actual = state.document.nodes[tid];
          if (!approxEqual(actual, initial)) {
            const m = firstMismatch(actual, initial);
            throw new Error(
              `[${path.basename(fixturePath)}] text round-trip mismatch at ${
                m?.path ?? "<unknown>"
              }: ${JSON.stringify(m?.a)} !== ${JSON.stringify(m?.b)}`
            );
          }
        }
      );

      itIf(vector_id)(
        "vector node round-trips for 0.01x then 100x (epsilon on numbers)",
        () => {
          const vid = vector_id!;
          let state = initEditorStateFromFixture({ scene_id, document });
          const initial = deepClone(state.document.nodes[vid]);

          const ctx = createContext(() => state);
          state = applyScaleOnce(state, ctx, {
            targets: [vid],
            factor: 0.01,
            origin: "center",
            include_subtree: false,
          });
          state = applyScaleOnce(state, ctx, {
            targets: [vid],
            factor: 100,
            origin: "center",
            include_subtree: false,
          });

          expect(approxEqual(state.document.nodes[vid], initial)).toBe(true);
        }
      );

      describe.each(root_container_ids.map((id) => [id] as const))(
        "root container: %s",
        (root_container_id) => {
          it("subtree round-trips for 0.01x then 100x (include_subtree=true)", () => {
            const nodes = document.nodes as Record<string, any>;
            const rootNode = nodes[root_container_id];
            if (!hasNumericAbsoluteBox(rootNode)) {
              throw new Error(
                `[${path.basename(fixturePath)}] root container ${root_container_id} is not a numeric absolute box`
              );
            }

            const tracked_ids = getTrackableSubtreeNodeIds({
              doc: document,
              root_id: root_container_id,
            });
            if (!tracked_ids.length) {
              throw new Error(
                `[${path.basename(fixturePath)}] root container ${root_container_id} produced 0 trackable ids`
              );
            }

            let state = initEditorStateFromFixture({ scene_id, document });

            const initial: Record<string, unknown> = {};
            for (const id of tracked_ids) {
              initial[id] = deepClone(state.document.nodes[id]);
            }

            const ctx = createContext(() => state);
            state = applyScaleOnce(state, ctx, {
              targets: [root_container_id],
              factor: 0.01,
              origin: "center",
              include_subtree: true,
            });
            state = applyScaleOnce(state, ctx, {
              targets: [root_container_id],
              factor: 100,
              origin: "center",
              include_subtree: true,
            });

            const final: Record<string, unknown> = {};
            for (const id of tracked_ids) {
              final[id] = state.document.nodes[id];
            }

            expect(approxEqual(final, initial)).toBe(true);
          });
        }
      );
    }
  );
});

import { NativeEditorSvgSelection } from "@grida/desktop-bridge";
import type { NodeId, SvgEditor, VectorSubSelection } from "@grida/svg-editor";

type Surface = Readonly<{ basis: object; path: string; editor: SvgEditor }>;
type Selection = Surface & {
  nodes: readonly NodeId[];
  vector: VectorSubSelection | null;
  mode: SvgEditor["state"]["mode"];
  version: number;
  loadVersion: number;
};

type Capture = Selection & { prefix: string; issued: number };
const MAX_CAPTURE_SEQUENCE = 0xffff_ffff;

/** Capture live editor selections for the messages that named them at Send. */
export class SelectedSvg {
  private captured?: Capture;
  private readonly listeners = new Set<() => void>();
  private observedEditor?: SvgEditor;
  private stopObservingEditor?: () => void;
  private stopObservingSurface?: () => void;
  private available = false;

  constructor(
    private readonly surface: () => Surface | undefined,
    private readonly observeSurface?: (listener: () => void) => () => void
  ) {}

  readonly hasSelection = (): boolean =>
    this.listeners.size > 0 ? this.available : this.read() !== undefined;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (!this.listeners.size) this.available = this.read() !== undefined;
    this.listeners.add(listener);
    this.observe();
    return () => {
      this.listeners.delete(listener);
      this.observe();
    };
  };

  capture(): string | undefined {
    this.checkCapture();
    if (!this.captured) {
      const current = this.read();
      if (!current) return;
      const { vector } = current;
      this.captured = {
        ...current,
        prefix: capturePrefix(),
        issued: 0,
        nodes: [...current.nodes],
        vector: vector && {
          node_id: vector.node_id,
          vertices: [...vector.vertices],
          segments: [...vector.segments],
          tangents: vector.tangents.map(([vertex, side]) => [vertex, side]),
        },
      };
    }
    const capture = this.captured;
    if (capture.issued === MAX_CAPTURE_SEQUENCE) return;
    const sequence = ++capture.issued;
    this.observe();
    return capture.prefix + sequence.toString(16).padStart(8, "0");
  }

  invoke(
    request: NativeEditorSvgSelection.Request
  ): NativeEditorSvgSelection.Result {
    if (Date.now() >= request.expiresAtMs) return { kind: "unavailable" };
    this.checkCapture();
    const { targetId, operation } = request;
    const target = this.captured;
    if (!target || !issuedBy(target, targetId)) return { kind: "stale" };

    if (operation.kind === "inspect") {
      if (operation.cursor && operation.cursor.revision !== targetId)
        return { kind: "stale" };
      return inspect(target, targetId, operation.cursor?.offset ?? 0);
    }
    if (operation.revision !== targetId) return { kind: "stale" };
    if (target.mode !== "select") return { kind: "unsupported" };
    target.editor.commands.set_opacity(operation.opacity);
    return {
      kind:
        target.editor.state.content_version === target.version
          ? "unchanged"
          : "applied",
      path: target.path,
      saved: false,
    };
  }

  readonly surfaceChanged = (): void => {
    this.checkCapture();
    this.observe();
    if (!this.listeners.size) return;
    const available = this.read() !== undefined;
    if (available === this.available) return;
    this.available = available;
    for (const listener of this.listeners) listener();
  };

  private read(): Selection | undefined {
    const surface = this.surface();
    if (!surface) return;
    const state = surface.editor.state;
    const vector =
      state.mode === "edit-content"
        ? surface.editor.vector_subselection()
        : null;
    if (
      state.mode === "select"
        ? !state.selection.length
        : !vector || !vectorCount(vector)
    )
      return;
    return {
      ...surface,
      nodes: state.selection,
      mode: state.mode,
      vector,
      version: state.content_version,
      loadVersion: state.load_version,
    };
  }

  private checkCapture(): void {
    const target = this.captured;
    if (!target) return;
    const current = this.read();
    if (
      current?.basis === target.basis &&
      current.path === target.path &&
      current.editor === target.editor &&
      current.mode === target.mode &&
      current.version === target.version &&
      current.loadVersion === target.loadVersion &&
      equal(current.nodes, target.nodes) &&
      equalVector(current.vector, target.vector)
    )
      return;
    this.captured = undefined;
  }

  private observe(): void {
    const needed = !!this.captured || this.listeners.size > 0;
    if (needed) {
      this.stopObservingSurface ??= this.observeSurface?.(this.surfaceChanged);
    } else {
      this.stopObservingSurface?.();
      this.stopObservingSurface = undefined;
    }
    const editor = needed ? this.surface()?.editor : undefined;
    if (editor === this.observedEditor) return;
    this.stopObservingEditor?.();
    this.observedEditor = editor;
    if (!editor) {
      this.stopObservingEditor = undefined;
      return;
    }
    const stop = editor.subscribe(this.surfaceChanged);
    const stopVector = editor.subscribe_vector_subselection(
      this.surfaceChanged
    );
    this.stopObservingEditor = () => {
      stop();
      stopVector();
    };
  }
}

// UUID v8 with a random generation prefix and a distinct sequence per Send.
// Main owns admission. A refused Send cannot push an earlier capture out.
function capturePrefix(): string {
  const uuid = crypto.randomUUID();
  return `${uuid.slice(0, 14)}8${uuid.slice(15, -8)}`;
}

function issuedBy(capture: Capture, id: string): boolean {
  if (!NativeEditorSvgSelection.isId(id) || !id.startsWith(capture.prefix))
    return false;
  const sequence = Number.parseInt(id.slice(-8), 16);
  return sequence > 0 && sequence <= capture.issued;
}

function vectorCount(vector: VectorSubSelection): number {
  return (
    vector.vertices.length + vector.segments.length + vector.tangents.length
  );
}

function equal<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

function equalVector(
  a: VectorSubSelection | null,
  b: VectorSubSelection | null
): boolean {
  if (!a || !b) return a === b;
  return (
    a.node_id === b.node_id &&
    equal(a.vertices, b.vertices) &&
    equal(a.segments, b.segments) &&
    a.tangents.length === b.tangents.length &&
    a.tangents.every(([vertex, side], i) => {
      const other = b.tangents[i];
      return other[0] === vertex && other[1] === side;
    })
  );
}

function inspect(
  target: Selection,
  revision: string,
  offset: number
): NativeEditorSvgSelection.Result {
  const { vector } = target;
  const total = vector ? vectorCount(vector) : target.nodes.length;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= total)
    return { kind: "unsupported" };
  const tree = target.editor.tree();
  const page = {
    kind: "inspection" as const,
    revision,
    path: target.path,
    total,
  };
  if (vector) {
    const mode = "vector" as const;
    const element = locate(tree, vector.node_id, 0);
    const first = vectorItem(vector, offset);
    const vectorElement = [element, locatorOnly(element), omitted(0)].find(
      (candidate) =>
        fits({
          ...page,
          mode,
          vectorElement: candidate,
          targets: [first],
          nextCursor: continuation(revision, total, offset + 1),
        })
    );
    if (!vectorElement) return { kind: "unavailable" };
    return paginate(
      revision,
      total,
      offset,
      (i) => vectorItem(vector, i),
      (targets, nextCursor) => ({
        ...page,
        mode,
        vectorElement,
        targets,
        nextCursor,
      })
    );
  }
  return paginate(
    revision,
    total,
    offset,
    (i) => locate(tree, target.nodes[i], i),
    (targets, nextCursor) => ({
      ...page,
      mode: "objects",
      targets,
      nextCursor,
    }),
    (target, i) => [locatorOnly(target), omitted(i)]
  );
}

function paginate<T extends NativeEditorSvgSelection.Target>(
  revision: string,
  total: number,
  offset: number,
  item: (i: number) => T,
  make: (
    items: T[],
    cursor: NativeEditorSvgSelection.Cursor | null
  ) => NativeEditorSvgSelection.Inspection,
  fallbacks?: (item: T, i: number) => readonly T[]
): NativeEditorSvgSelection.Result {
  const targets: T[] = [];
  while (
    offset < total &&
    targets.length < NativeEditorSvgSelection.MAX_PAGE_ITEMS
  ) {
    const target = item(offset);
    const nextCursor = continuation(revision, total, offset + 1);
    if (!fits(make([...targets, target], nextCursor))) {
      if (targets.length) break;
      const replacement = fallbacks?.(target, offset).find((candidate) =>
        fits(make([candidate], nextCursor))
      );
      if (!replacement) return { kind: "unavailable" };
      targets.push(replacement);
    } else {
      targets.push(target);
    }
    offset++;
  }
  return make(targets, continuation(revision, total, offset));
}

function continuation(revision: string, total: number, offset: number) {
  return offset < total ? { revision, offset } : null;
}

function fits(page: NativeEditorSvgSelection.Inspection): boolean {
  return (
    NativeEditorSvgSelection.pageBytes(page) <=
    NativeEditorSvgSelection.MAX_PAGE_BYTES
  );
}

function locate(
  tree: ReturnType<SvgEditor["tree"]>,
  id: NodeId,
  index: number
):
  | NativeEditorSvgSelection.ElementTarget
  | NativeEditorSvgSelection.OmittedTarget {
  const elementPath: number[] = [];
  const node = tree.nodes.get(id);
  if (!node) return omitted(index);
  while (id !== tree.root) {
    const parent = tree.nodes.get(id)?.parent;
    const child = parent
      ? tree.nodes.get(parent)?.children.indexOf(id)
      : undefined;
    if (
      !parent ||
      child === undefined ||
      child < 0 ||
      elementPath.length >= NativeEditorSvgSelection.MAX_LOCATOR_DEPTH
    )
      return omitted(index);
    elementPath.push(child);
    id = parent;
  }
  return {
    kind: "element",
    elementPath: elementPath.reverse(),
    ...(NativeEditorSvgSelection.isLabel(node.tag) && {
      tag: node.tag,
    }),
    ...(node.name &&
      NativeEditorSvgSelection.isLabel(node.name) && {
        id: node.name,
      }),
  };
}

function omitted(index: number): NativeEditorSvgSelection.OmittedTarget {
  return { kind: "omitted", index, reason: "locator_too_large" };
}

function locatorOnly(
  target:
    | NativeEditorSvgSelection.ElementTarget
    | NativeEditorSvgSelection.OmittedTarget
):
  | NativeEditorSvgSelection.ElementTarget
  | NativeEditorSvgSelection.OmittedTarget {
  return target.kind === "element"
    ? { kind: "element", elementPath: target.elementPath }
    : target;
}

function vectorItem(
  vector: VectorSubSelection,
  offset: number
): NativeEditorSvgSelection.VectorTarget {
  if (offset < vector.vertices.length)
    return { kind: "vertex", index: vector.vertices[offset] };
  offset -= vector.vertices.length;
  if (offset < vector.segments.length)
    return { kind: "segment", index: vector.segments[offset] };
  const [vertex, side] = vector.tangents[offset - vector.segments.length];
  return { kind: "tangent", vertex, side };
}

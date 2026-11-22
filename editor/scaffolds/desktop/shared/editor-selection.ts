import { NativeEditorSelection } from "@grida/desktop-bridge";
import type { NodeId, SvgEditor, VectorSubSelection } from "@grida/svg-editor";
import { svgTagLabel } from "@/lib/svg-tag-label";

type SvgSurface = Readonly<{
  basis: object;
  subject: NativeEditorSelection.Subject & { kind: "svg" };
  editor: SvgEditor;
}>;
type SvgSelection = SvgSurface & {
  nodes: readonly NodeId[];
  vector: VectorSubSelection | null;
  mode: SvgEditor["state"]["mode"];
  version: number;
  loadVersion: number;
};

type Selection = SvgSelection | EditorSelection.DocumentSurface;
type Capture = Selection & { prefix: string; issued: number };
const MAX_CAPTURE_SEQUENCE = 0xffff_ffff;

/** Capture live editor selections for the messages that named them at Send. */
export class EditorSelection {
  private captured?: Capture;
  private readonly listeners = new Set<() => void>();
  private observedEditor?: SvgEditor;
  private stopObservingEditor?: () => void;
  private stopObservingSurface?: () => void;
  private selectedKind?: NativeEditorSelection.Subject["kind"];
  private selectedLabel?: string;
  private elementLabel?: {
    basis: object;
    id: NodeId;
    structureVersion: number;
    loadVersion: number;
    label: string;
  };

  constructor(
    private readonly surface: () => EditorSelection.Surface | undefined,
    private readonly observeSurface: (listener: () => void) => () => void,
    readonly clear: () => void
  ) {}

  readonly readSubject = (): NativeEditorSelection.Subject | undefined =>
    this.surface()?.subject;

  readonly readLabel = (): string | undefined =>
    this.listeners.size > 0 ? this.selectedLabel : this.labelFor(this.read());

  readonly hasSelection = (): boolean =>
    this.listeners.size > 0
      ? this.selectedKind !== undefined
      : this.read() !== undefined;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (!this.listeners.size) this.refreshPresentation();
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
      this.captured = {
        ...snapshot(current),
        prefix: capturePrefix(),
        issued: 0,
      };
    }
    const capture = this.captured;
    if (capture.issued === MAX_CAPTURE_SEQUENCE) return;
    const sequence = ++capture.issued;
    this.observe();
    return capture.prefix + sequence.toString(16).padStart(8, "0");
  }

  invoke(request: NativeEditorSelection.Request): NativeEditorSelection.Result {
    if (Date.now() >= request.expiresAtMs) return { kind: "unavailable" };
    this.checkCapture();
    const { targetId, operation } = request;
    const target = this.captured;
    if (
      !target ||
      !issuedBy(target, targetId) ||
      (!("editor" in target) && request.subject === undefined) ||
      (request.path !== undefined && target.subject.path !== request.path) ||
      (request.subject !== undefined &&
        !NativeEditorSelection.sameSubject(target.subject, request.subject))
    )
      return { kind: "stale" };

    if (operation.kind === "inspect") {
      if (operation.cursor && operation.cursor.revision !== targetId)
        return { kind: "stale" };
      const offset = operation.cursor?.offset ?? 0;
      return "editor" in target
        ? inspect(target, targetId, offset)
        : inspectDocument(target, targetId, offset);
    }
    if ("revision" in operation && operation.revision !== targetId)
      return { kind: "stale" };
    if (!("editor" in target) || target.mode !== "select")
      return { kind: "unsupported" };

    if (operation.kind === "set-opacity") {
      target.editor.commands.set_opacity(operation.opacity);
    } else {
      const selected = target.editor.read_selected_text();
      if (
        selected?.tag !== "text" ||
        !NativeEditorSelection.isText(selected.text)
      )
        return { kind: "unsupported" };
      if (operation.kind === "read-text")
        return {
          kind: "text",
          path: target.subject.path,
          revision: targetId,
          text: selected.text,
        };
      if (!NativeEditorSelection.isText(operation.text))
        return { kind: "unsupported" };
      if (selected.text !== operation.text)
        target.editor.commands.set_text(operation.text);
    }
    return {
      kind:
        target.editor.state.content_version === target.version
          ? "unchanged"
          : "applied",
      path: target.subject.path,
      saved: false,
    };
  }

  private readonly surfaceChanged = (): void => {
    this.checkCapture();
    this.observe();
    if (this.listeners.size > 0 && this.refreshPresentation())
      for (const listener of this.listeners) listener();
  };

  private refreshPresentation(): boolean {
    const selection = this.read();
    const kind = selection?.subject.kind;
    const label = this.labelFor(selection);
    if (kind === this.selectedKind && label === this.selectedLabel)
      return false;
    this.selectedKind = kind;
    this.selectedLabel = label;
    return true;
  }

  private labelFor(selection: Selection | undefined): string | undefined {
    if (
      selection &&
      "editor" in selection &&
      !selection.vector &&
      selection.nodes.length === 1
    ) {
      const { basis, editor, loadVersion } = selection;
      const id = selection.nodes[0];
      const structureVersion = editor.state.structure_version;
      const cached = this.elementLabel;
      if (
        cached?.basis === basis &&
        cached.id === id &&
        cached.structureVersion === structureVersion &&
        cached.loadVersion === loadVersion
      )
        return cached.label;
      const label = editor.display_label(id, { tagLabel: svgTagLabel });
      this.elementLabel = { basis, id, structureVersion, loadVersion, label };
      return label;
    }
    this.elementLabel = undefined;
    if (!selection) return;
    if (!("editor" in selection)) return "Selection";
    if (selection.vector) return vectorLabel(selection.vector);
    return `${selection.nodes.length} elements`;
  }

  private read(): Selection | undefined {
    const surface = this.surface();
    if (!surface || !("editor" in surface)) return surface;
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
    if (current && sameSelection(current, target)) return;
    this.captured = undefined;
  }

  private observe(): void {
    const needed = !!this.captured || this.listeners.size > 0;
    if (needed) {
      this.stopObservingSurface ??= this.observeSurface(this.surfaceChanged);
    } else {
      this.stopObservingSurface?.();
      this.stopObservingSurface = undefined;
      this.elementLabel = undefined;
    }
    const surface = needed ? this.surface() : undefined;
    const editor = surface && "editor" in surface ? surface.editor : undefined;
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

export namespace EditorSelection {
  export type Document = Readonly<{
    subject: NativeEditorSelection.Subject & { kind: "document" };
    layout: NativeEditorSelection.Layout | null;
  }>;

  export type DocumentSurface = Document & Readonly<{ basis: object }>;
  export type Surface = SvgSurface | DocumentSurface;
}

function snapshot(selection: Selection): Selection {
  if (!("editor" in selection)) {
    const { subject, layout } = selection;
    return {
      ...selection,
      subject: {
        ...subject,
        ...(subject.placement && { placement: { ...subject.placement } }),
      },
      layout: layout && { ...layout },
    };
  }
  const { vector } = selection;
  return {
    ...selection,
    nodes: [...selection.nodes],
    vector: vector && {
      node_id: vector.node_id,
      vertices: [...vector.vertices],
      segments: [...vector.segments],
      tangents: vector.tangents.map(([vertex, side]) => [vertex, side]),
    },
  };
}

function sameSelection(a: Selection, b: Selection): boolean {
  if (
    a.basis !== b.basis ||
    !NativeEditorSelection.sameSubject(a.subject, b.subject)
  )
    return false;
  if ("editor" in a && "editor" in b)
    return (
      a.editor === b.editor &&
      a.mode === b.mode &&
      a.version === b.version &&
      a.loadVersion === b.loadVersion &&
      equal(a.nodes, b.nodes) &&
      equalVector(a.vector, b.vector)
    );
  return !("editor" in a) && !("editor" in b) && sameLayout(a.layout, b.layout);
}

function sameLayout(
  a: NativeEditorSelection.Layout | null,
  b: NativeEditorSelection.Layout | null
): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.x === b.x &&
      a.y === b.y &&
      a.w === b.w &&
      a.h === b.h &&
      a.z === b.z)
  );
}

function inspectDocument(
  target: EditorSelection.DocumentSurface,
  revision: string,
  offset: number
): NativeEditorSelection.Result {
  if (offset !== 0) return { kind: "unsupported" };
  const { path, placement } = target.subject;
  return {
    kind: "inspection",
    mode: "document",
    path,
    revision,
    total: 1,
    nextCursor: null,
    targets: [
      {
        kind: "document",
        ...(placement && {
          placement: { ...placement, layout: target.layout },
        }),
      },
    ],
  };
}

// UUID v8 with a random generation prefix and a distinct sequence per Send.
// Main owns admission. A refused Send cannot push an earlier capture out.
function capturePrefix(): string {
  const uuid = crypto.randomUUID();
  return `${uuid.slice(0, 14)}8${uuid.slice(15, -8)}`;
}

function issuedBy(capture: Capture, id: string): boolean {
  if (!NativeEditorSelection.isId(id) || !id.startsWith(capture.prefix))
    return false;
  const sequence = Number.parseInt(id.slice(-8), 16);
  return sequence > 0 && sequence <= capture.issued;
}

function vectorCount(vector: VectorSubSelection): number {
  return (
    vector.vertices.length + vector.segments.length + vector.tangents.length
  );
}

function vectorLabel(vector: VectorSubSelection): string {
  const count = vectorCount(vector);
  const noun =
    vector.vertices.length === count
      ? "point"
      : vector.segments.length === count
        ? "segment"
        : vector.tangents.length === count
          ? "handle"
          : "path part";
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
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
  target: SvgSelection,
  revision: string,
  offset: number
): NativeEditorSelection.Result {
  const { vector } = target;
  const total = vector ? vectorCount(vector) : target.nodes.length;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= total)
    return { kind: "unsupported" };
  const tree = target.editor.tree();
  const page = {
    kind: "inspection" as const,
    revision,
    path: target.subject.path,
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

function paginate<T extends NativeEditorSelection.Target>(
  revision: string,
  total: number,
  offset: number,
  item: (i: number) => T,
  make: (
    items: T[],
    cursor: NativeEditorSelection.Cursor | null
  ) => NativeEditorSelection.Inspection,
  fallbacks?: (item: T, i: number) => readonly T[]
): NativeEditorSelection.Result {
  const targets: T[] = [];
  while (
    offset < total &&
    targets.length < NativeEditorSelection.MAX_PAGE_ITEMS
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

function fits(page: NativeEditorSelection.Inspection): boolean {
  return (
    NativeEditorSelection.pageBytes(page) <=
    NativeEditorSelection.MAX_PAGE_BYTES
  );
}

function locate(
  tree: ReturnType<SvgEditor["tree"]>,
  id: NodeId,
  index: number
): NativeEditorSelection.ElementTarget | NativeEditorSelection.OmittedTarget {
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
      elementPath.length >= NativeEditorSelection.MAX_LOCATOR_DEPTH
    )
      return omitted(index);
    elementPath.push(child);
    id = parent;
  }
  return {
    kind: "element",
    elementPath: elementPath.reverse(),
    ...(NativeEditorSelection.isLabel(node.tag) && {
      tag: node.tag,
    }),
    ...(node.name &&
      NativeEditorSelection.isLabel(node.name) && {
        id: node.name,
      }),
  };
}

function omitted(index: number): NativeEditorSelection.OmittedTarget {
  return { kind: "omitted", index, reason: "locator_too_large" };
}

function locatorOnly(
  target:
    | NativeEditorSelection.ElementTarget
    | NativeEditorSelection.OmittedTarget
): NativeEditorSelection.ElementTarget | NativeEditorSelection.OmittedTarget {
  return target.kind === "element"
    ? { kind: "element", elementPath: target.elementPath }
    : target;
}

function vectorItem(
  vector: VectorSubSelection,
  offset: number
): NativeEditorSelection.VectorTarget {
  if (offset < vector.vertices.length)
    return { kind: "vertex", index: vector.vertices[offset] };
  offset -= vector.vertices.length;
  if (offset < vector.segments.length)
    return { kind: "segment", index: vector.segments[offset] };
  const [vertex, side] = vector.tangents[offset - vector.segments.length];
  return { kind: "tangent", vertex, side };
}

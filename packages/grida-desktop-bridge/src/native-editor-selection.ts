// GRIDA-SEC-004 — bounded results for one captured live editor selection.
import { isEditorBundleMember, isEditorSvgPath } from "./native-editor-path";

const utf8 = new TextEncoder();

export namespace NativeEditorSelection {
  export const MAX_PAGE_ITEMS = 32;
  export const MAX_PAGE_BYTES = 28 * 1024;
  export const MAX_LABEL_LENGTH = 256;
  export const MAX_LOCATOR_DEPTH = MAX_PAGE_BYTES / 2;
  export const MAX_TEXT_BYTES = 4096;
  export const MAX_PIN_ID_BYTES = 256;
  const layoutKeys = ["x", "y", "w", "h", "z"] as const;

  export type Layout = Readonly<
    Partial<Record<(typeof layoutKeys)[number], number>>
  >;
  export type Placement = Readonly<{ boardPath: string; pinId: string }>;
  export type Subject =
    | Readonly<{ kind: "svg"; path: string }>
    | Readonly<{ kind: "document"; path: string; placement?: Placement }>;
  export type Capture = Readonly<{ targetId: string; subject: Subject }>;

  export type Cursor = Readonly<{ revision: string; offset: number }>;
  export type Operation =
    | Readonly<{ kind: "inspect"; cursor?: Cursor }>
    | Readonly<{ kind: "set-opacity"; revision: string; opacity: number }>
    | Readonly<{ kind: "read-text" }>
    | Readonly<{ kind: "replace-text"; revision: string; text: string }>;
  export type Request = Readonly<{
    targetId: string;
    expiresAtMs: number;
    /** The SVG document bound by the host before dispatch. */
    path?: string;
    subject?: Subject;
    operation: Operation;
  }>;

  export type ElementTarget = Readonly<{
    kind: "element";
    elementPath: readonly number[];
    tag?: string;
    id?: string;
  }>;
  export type OmittedTarget = Readonly<{
    kind: "omitted";
    index: number;
    reason: "locator_too_large";
  }>;
  export type VectorTarget =
    | Readonly<{ kind: "vertex" | "segment"; index: number }>
    | Readonly<{ kind: "tangent"; vertex: number; side: 0 | 1 }>;
  export type DocumentTarget = Readonly<{
    kind: "document";
    placement?: Placement & Readonly<{ layout: Layout | null }>;
  }>;
  export type Target =
    | ElementTarget
    | OmittedTarget
    | VectorTarget
    | DocumentTarget;

  type Page = Readonly<{
    kind: "inspection";
    revision: string;
    path: string;
    total: number;
    nextCursor: Cursor | null;
  }>;
  export type Inspection =
    | (Page &
        (
          | Readonly<{
              mode: "objects";
              targets: readonly (ElementTarget | OmittedTarget)[];
            }>
          | Readonly<{
              mode: "vector";
              vectorElement: ElementTarget | OmittedTarget;
              targets: readonly VectorTarget[];
            }>
        ))
    | (Omit<Page, "total" | "nextCursor"> &
        Readonly<{
          mode: "document";
          total: 1;
          nextCursor: null;
          targets: readonly [DocumentTarget];
        }>);
  export type Result =
    | Inspection
    | Readonly<{ kind: "text"; path: string; revision: string; text: string }>
    | Readonly<{ kind: "applied" | "unchanged"; path: string; saved: false }>
    | Readonly<{ kind: "stale" | "unavailable" | "unsupported" }>;

  export function isId(value: unknown): value is string {
    return (
      typeof value === "string" &&
      value.length === 36 &&
      /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)
    );
  }

  export function isText(value: unknown): value is string {
    if (
      typeof value !== "string" ||
      value.length > MAX_TEXT_BYTES ||
      utf8.encode(value).length > MAX_TEXT_BYTES
    )
      return false;
    for (const char of value) {
      const code = char.codePointAt(0)!;
      if (code === 9 || code === 10 || code === 13) continue;
      if (
        code < 32 ||
        (code >= 0xd800 && code <= 0xdfff) ||
        code === 0xfffe ||
        code === 0xffff
      )
        return false;
    }
    return true;
  }

  /** Validate file and placement identity. Attachment authority belongs to the host. */
  export function subject(value: unknown): Subject | undefined {
    const object = record(value);
    if (!object) return;
    const { kind, path } = object;
    if (!isEditorSvgPath(path)) return;
    if (kind === "svg" && only(object, "kind", "path"))
      return Object.freeze({ kind, path });
    if (kind !== "document" || !only(object, "kind", "path", "placement"))
      return;
    if (!Object.hasOwn(object, "placement"))
      return Object.freeze({ kind, path });
    const placement = record(object.placement);
    if (!placement || !only(placement, "boardPath", "pinId")) return;
    const identity = readPlacement(path, placement);
    if (identity)
      return Object.freeze({ kind, path, placement: Object.freeze(identity) });
  }

  export function sameSubject(
    left: Subject | undefined,
    right: Subject | undefined
  ): boolean {
    if (left === right) return true;
    if (!left || !right || left.kind !== right.kind || left.path !== right.path)
      return false;
    if (left.kind === "svg") return true;
    return (
      right.kind === "document" &&
      left.placement?.boardPath === right.placement?.boardPath &&
      left.placement?.pinId === right.placement?.pinId
    );
  }

  /** Bind the rendered subject to the capture token carried with a message. */
  export function capture(value: unknown): Capture | undefined {
    const object = record(value);
    if (
      !object ||
      Object.keys(object).length !== 2 ||
      !only(object, "targetId", "subject") ||
      !isId(object.targetId)
    )
      return;
    const selection = subject(object.subject);
    if (selection)
      return Object.freeze({ targetId: object.targetId, subject: selection });
  }

  export function layout(value: unknown): Layout | null | undefined {
    if (value === null) return null;
    const object = record(value);
    if (!object || !only(object, ...layoutKeys)) return;
    const placement: Partial<Record<(typeof layoutKeys)[number], number>> = {};
    for (const key of layoutKeys) {
      if (!Object.hasOwn(object, key)) continue;
      const coordinate = object[key];
      if (typeof coordinate !== "number" || !Number.isFinite(coordinate))
        return;
      placement[key] = coordinate;
    }
    if (Object.keys(placement).length) return placement;
  }

  export function operation(value: unknown): Operation | undefined {
    const object = record(value);
    if (!object) return;
    if (object.kind === "inspect" && only(object, "kind", "cursor")) {
      if (!Object.hasOwn(object, "cursor")) return { kind: "inspect" };
      const cursor = readCursor(object.cursor);
      if (cursor) return { kind: "inspect", cursor };
    }
    if (object.kind === "read-text" && only(object, "kind"))
      return { kind: "read-text" };
    if (
      object.kind === "replace-text" &&
      only(object, "kind", "revision", "text") &&
      isId(object.revision) &&
      isText(object.text)
    )
      return {
        kind: "replace-text",
        revision: object.revision,
        text: object.text,
      };
    if (
      object.kind === "set-opacity" &&
      only(object, "kind", "revision", "opacity") &&
      isId(object.revision) &&
      typeof object.opacity === "number" &&
      Number.isFinite(object.opacity) &&
      object.opacity >= 0 &&
      object.opacity <= 1
    )
      return {
        kind: "set-opacity",
        revision: object.revision,
        opacity: object.opacity,
      };
  }

  export function result(value: unknown): Result | undefined {
    const object = record(value);
    if (!object) return;
    const { kind, path } = object;
    if (
      (kind === "stale" || kind === "unavailable" || kind === "unsupported") &&
      only(object, "kind")
    )
      return { kind };
    if (!isEditorSvgPath(path)) return;
    if (
      kind === "text" &&
      only(object, "kind", "path", "revision", "text") &&
      isId(object.revision) &&
      isText(object.text)
    )
      return { kind, path, revision: object.revision, text: object.text };
    if (
      (kind === "applied" || kind === "unchanged") &&
      object.saved === false &&
      only(object, "kind", "saved", "path")
    )
      return { kind, path, saved: false };
    if (kind !== "inspection") return;
    const inspection = readInspection(object, path);
    if (inspection && pageBytes(inspection) <= MAX_PAGE_BYTES)
      return inspection;
  }

  export function pageBytes(page: Inspection): number {
    return utf8.encode(JSON.stringify(page)).byteLength;
  }

  export function isLabel(value: unknown): value is string {
    return (
      typeof value === "string" &&
      value.length <= MAX_LABEL_LENGTH &&
      !/[\uD800-\uDFFF]/u.test(value)
    );
  }

  function readInspection(
    object: Record<string, unknown>,
    path: string
  ): Inspection | undefined {
    const { revision, mode, total, targets } = object;
    const nextCursor =
      object.nextCursor === null ? null : readCursor(object.nextCursor);
    if (
      !only(
        object,
        "kind",
        "path",
        "revision",
        "mode",
        "total",
        "targets",
        "vectorElement",
        "nextCursor"
      ) ||
      !isId(revision) ||
      !ordinal(total) ||
      !Array.isArray(targets) ||
      targets.length === 0 ||
      targets.length > Math.min(MAX_PAGE_ITEMS, total) ||
      nextCursor === undefined ||
      (nextCursor &&
        (nextCursor.revision !== revision ||
          nextCursor.offset < targets.length ||
          nextCursor.offset >= total))
    )
      return;
    const page = {
      kind: "inspection" as const,
      revision,
      path,
      total,
      nextCursor,
    };
    if (mode === "objects" && !Object.hasOwn(object, "vectorElement")) {
      const start = (nextCursor?.offset ?? total) - targets.length;
      const entries = Array.from(targets, (target, index) =>
        readElementTarget(target, start + index)
      );
      if (entries.every((target) => target !== undefined))
        return { ...page, mode, targets: entries };
    }
    if (mode === "vector") {
      const element = readElementTarget(object.vectorElement, 0);
      const entries = Array.from(targets, readVectorTarget);
      if (element && entries.every((target) => target !== undefined))
        return { ...page, mode, vectorElement: element, targets: entries };
    }
    if (
      mode === "document" &&
      total === 1 &&
      nextCursor === null &&
      !Object.hasOwn(object, "vectorElement")
    ) {
      const target = readDocumentTarget(path, targets[0]);
      if (target)
        return { ...page, mode, total, nextCursor, targets: [target] };
    }
  }

  function readDocumentTarget(
    path: string,
    value: unknown
  ): DocumentTarget | undefined {
    const object = record(value);
    if (
      !object ||
      object.kind !== "document" ||
      !only(object, "kind", "placement")
    )
      return;
    if (!Object.hasOwn(object, "placement")) return { kind: "document" };
    const placement = record(object.placement);
    if (!placement || !only(placement, "boardPath", "pinId", "layout")) return;
    const identity = readPlacement(path, placement);
    const position = layout(placement.layout);
    if (identity && position !== undefined)
      return { kind: "document", placement: { ...identity, layout: position } };
  }

  function readPlacement(
    path: string,
    value: Record<string, unknown>
  ): Placement | undefined {
    const { boardPath, pinId } = value;
    if (
      (boardPath === "/" || isEditorBundleMember(boardPath, path)) &&
      typeof pinId === "string" &&
      pinId.length > 0 &&
      pinId.length <= MAX_PIN_ID_BYTES &&
      // eslint-disable-next-line no-control-regex -- Pin IDs exclude control characters and lone surrogates.
      !/[\u0000-\u001F\u007F-\u009F\uD800-\uDFFF]/u.test(pinId) &&
      utf8.encode(pinId).byteLength <= MAX_PIN_ID_BYTES
    )
      return { boardPath, pinId };
  }

  function readElementTarget(
    value: unknown,
    position: number
  ): ElementTarget | OmittedTarget | undefined {
    const object = record(value);
    if (!object) return;
    const { kind, elementPath, tag, id, index, reason } = object;
    if (
      kind === "omitted" &&
      index === position &&
      reason === "locator_too_large" &&
      only(object, "kind", "index", "reason")
    )
      return { kind, index, reason };
    if (
      kind === "element" &&
      Array.isArray(elementPath) &&
      elementPath.length <= MAX_LOCATOR_DEPTH &&
      Array.from(elementPath).every(ordinal) &&
      (tag === undefined || isLabel(tag)) &&
      (id === undefined || isLabel(id)) &&
      only(object, "kind", "elementPath", "tag", "id")
    )
      return {
        kind,
        elementPath,
        ...(tag === undefined ? {} : { tag }),
        ...(id === undefined ? {} : { id }),
      };
  }

  function readVectorTarget(value: unknown): VectorTarget | undefined {
    const object = record(value);
    if (!object) return;
    const { kind, index, vertex, side } = object;
    if (
      (kind === "vertex" || kind === "segment") &&
      ordinal(index) &&
      only(object, "kind", "index")
    )
      return { kind, index };
    if (
      kind === "tangent" &&
      ordinal(vertex) &&
      (side === 0 || side === 1) &&
      only(object, "kind", "vertex", "side")
    )
      return { kind, vertex, side };
  }

  function readCursor(value: unknown): Cursor | undefined {
    const object = record(value);
    if (
      object &&
      only(object, "revision", "offset") &&
      isId(object.revision) &&
      ordinal(object.offset)
    )
      return { revision: object.revision, offset: object.offset };
  }

  function ordinal(value: unknown): value is number {
    return (
      typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    );
  }

  function only(object: Record<string, unknown>, ...keys: string[]): boolean {
    return Object.keys(object).every((key) => keys.includes(key));
  }

  function record(value: unknown): Record<string, unknown> | undefined {
    if (value && typeof value === "object" && !Array.isArray(value))
      return value as Record<string, unknown>;
  }
}

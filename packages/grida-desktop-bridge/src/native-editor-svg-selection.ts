// GRIDA-SEC-004 — bounded results for one captured live SVG selection.
import { NativeEditorSurfaces } from "./native-editor-surfaces";
import { NativeEditorSvgText } from "./native-editor-svg-text";

const utf8 = new TextEncoder();

export namespace NativeEditorSvgSelection {
  export const MAX_PAGE_ITEMS = 32;
  export const MAX_PAGE_BYTES = 28 * 1024;
  export const MAX_LABEL_LENGTH = 256;
  export const MAX_LOCATOR_DEPTH = MAX_PAGE_BYTES / 2;
  export const isId = NativeEditorSvgText.isId;

  export type Cursor = Readonly<{ revision: string; offset: number }>;
  export type Operation =
    | Readonly<{ kind: "inspect"; cursor?: Cursor }>
    | Readonly<{ kind: "set-opacity"; revision: string; opacity: number }>;
  export type Request = Readonly<{
    targetId: string;
    expiresAtMs: number;
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
  export type Target = ElementTarget | OmittedTarget | VectorTarget;

  type Page = Readonly<{
    kind: "inspection";
    revision: string;
    path: string;
    total: number;
    nextCursor: Cursor | null;
  }>;
  export type Inspection = Page &
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
    );
  export type Result =
    | Inspection
    | Readonly<{ kind: "applied" | "unchanged"; path: string; saved: false }>
    | Readonly<{ kind: "stale" | "unavailable" | "unsupported" }>;

  export function operation(value: unknown): Operation | undefined {
    const object = record(value);
    if (!object) return;
    if (object.kind === "inspect" && only(object, "kind", "cursor")) {
      if (!Object.hasOwn(object, "cursor")) return { kind: "inspect" };
      const cursor = readCursor(object.cursor);
      if (cursor) return { kind: "inspect", cursor };
    }
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
    if (
      !NativeEditorSurfaces.isPath(path) ||
      !path.toLowerCase().endsWith(".svg")
    )
      return;
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

// GRIDA-SEC-004 — one operation on the captured live SVG text selection.
import { NativeEditorSurfaces } from "./native-editor-surfaces";
import { NativeEditorSelection } from "./native-editor-selection";

export namespace NativeEditorSvgText {
  export type Operation =
    | { kind: "read" }
    | { kind: "replace"; revision: string; text: string };
  export type Request = Readonly<{
    targetId: string;
    expiresAtMs: number;
    operation: Operation;
  }>;
  export type Result =
    | { kind: "read"; path: string; revision: string; text: string }
    | { kind: "applied" | "unchanged"; path: string; saved: false }
    | { kind: "unavailable" | "stale" };

  export const isId = NativeEditorSelection.isId;
  export const isText = NativeEditorSelection.isText;

  export function operation(value: unknown): Operation | undefined {
    const object = record(value);
    if (!object) return;
    if (object.kind === "read" && Object.keys(object).length === 1)
      return { kind: "read" };
    if (
      object.kind === "replace" &&
      Object.keys(object).length === 3 &&
      isId(object.revision) &&
      isText(object.text)
    )
      return { kind: "replace", revision: object.revision, text: object.text };
  }

  export function result(value: unknown): Result | undefined {
    const object = record(value);
    if (!object) return;
    const keys = Object.keys(object).length;
    if (
      (object.kind === "unavailable" || object.kind === "stale") &&
      keys === 1
    )
      return { kind: object.kind };
    if (!NativeEditorSurfaces.isSvgPath(object.path)) return;
    if (
      object.kind === "read" &&
      keys === 4 &&
      isId(object.revision) &&
      isText(object.text)
    )
      return {
        kind: "read",
        path: object.path,
        revision: object.revision,
        text: object.text,
      };
    if (
      (object.kind === "applied" || object.kind === "unchanged") &&
      keys === 3 &&
      object.saved === false
    )
      return { kind: object.kind, path: object.path, saved: false };
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
}

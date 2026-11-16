// GRIDA-SEC-004 — one operation on the captured live SVG text selection.
import { NativeEditorSurfaces } from "./native-editor-surfaces";

const utf8 = new TextEncoder();

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

  export function isId(value: unknown): value is string {
    return (
      typeof value === "string" &&
      value.length === 36 &&
      /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)
    );
  }

  export function isText(value: unknown): value is string {
    if (typeof value !== "string" || utf8.encode(value).length > 4096)
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
    if (
      !NativeEditorSurfaces.isPath(object.path) ||
      !object.path.toLowerCase().endsWith(".svg")
    )
      return;
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

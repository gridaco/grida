import {
  isEditorBundleMember,
  isEditorPath,
  isEditorSvgPath,
} from "./native-editor-path";
import { NativeEditorSelection } from "./native-editor-selection";

type PublishedSelection =
  | Readonly<{ activeSvg?: string; selection?: never }>
  | Readonly<{ activeSvg?: never; selection: NativeEditorSelection.Subject }>;

export type NativeEditorSurfaceSnapshot = Readonly<{
  active: string | null;
  open: readonly string[];
  truncated: boolean;
}> &
  PublishedSelection;

export type NativeEditorSurfaceOpen = Readonly<{
  path: string;
  revision: number;
  expiresAtMs: number;
}>;

export namespace NativeEditorSurfaces {
  const MAX_OPEN = 50;
  const MAX_SNAPSHOT_BYTES = 16 * 1024;
  const encoder = new TextEncoder();
  export const isPath = isEditorPath;
  export const isSvgPath = isEditorSvgPath;
  type Selection = string | NativeEditorSelection.Subject;

  function bytes(value: string): number {
    return encoder.encode(value).byteLength;
  }

  function isActiveSvg(active: string | null, svg: unknown): svg is string {
    return (
      isSvgPath(svg) && (svg === active || isEditorBundleMember(active, svg))
    );
  }

  function isSelectionInView(
    active: string | null,
    openCount: number,
    truncated: boolean,
    selection: NativeEditorSelection.Subject
  ): boolean {
    if (selection.kind === "svg") return isActiveSvg(active, selection.path);
    const board = selection.placement?.boardPath;
    if (board === "/") return active === null && openCount === 0 && !truncated;
    return active === (board ?? selection.path);
  }

  function snapshotBytes(
    active: string | null,
    open: readonly string[],
    selection?: Selection
  ): number {
    return bytes(
      JSON.stringify(
        selection === undefined ? [active, open] : [active, open, selection]
      )
    );
  }

  function selectionFields(selection?: Selection): PublishedSelection {
    if (typeof selection === "string") return { activeSvg: selection };
    return selection === undefined ? {} : { selection };
  }

  /** Keep the active artifact and preserve the order of retained tabs. */
  export function capture(
    source: Pick<
      NativeEditorSurfaceSnapshot,
      "active" | "open" | "activeSvg" | "selection"
    >
  ): NativeEditorSurfaceSnapshot {
    const active =
      isPath(source.active) &&
      source.open.includes(source.active) &&
      snapshotBytes(source.active, [source.active]) <= MAX_SNAPSHOT_BYTES
        ? source.active
        : null;
    let selection: Selection | undefined;
    if (source.activeSvg === undefined) {
      const subject = NativeEditorSelection.subject(source.selection);
      if (
        subject &&
        isSelectionInView(
          active,
          source.open.length,
          source.active !== active,
          subject
        )
      )
        selection = subject;
    } else if (
      source.selection === undefined &&
      isActiveSvg(active, source.activeSvg)
    ) {
      selection = source.activeSvg;
    }
    if (
      snapshotBytes(active, active === null ? [] : [active], selection) >
      MAX_SNAPSHOT_BYTES
    )
      selection = undefined;
    const open: string[] = [];
    let truncated =
      source.active !== active ||
      ((source.activeSvg !== undefined || source.selection !== undefined) &&
        selection === undefined);
    let reserved = active !== null;
    const itemBytes = (path: string) => bytes(JSON.stringify(path)) + 1;
    // The first list entry does not need a comma.
    let length = snapshotBytes(active, [], selection) - 1;
    if (active !== null) length += itemBytes(active);
    for (const path of source.open) {
      if (!isPath(path) || open.includes(path)) {
        truncated = true;
      } else if (path === active) {
        open.push(path);
        reserved = false;
      } else {
        const next = length + itemBytes(path);
        if (
          open.length + Number(reserved) >= MAX_OPEN ||
          next > MAX_SNAPSHOT_BYTES
        ) {
          truncated = true;
          continue;
        }
        length = next;
        open.push(path);
      }
    }
    return {
      active,
      open,
      truncated,
      ...selectionFields(selection),
    };
  }

  /** Accept only the bounded presentation projection across the native bridge. */
  export function parse(value: unknown): NativeEditorSurfaceSnapshot | null {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const record = value as Record<string, unknown>;
    const { active, open, truncated } = record;
    const hasActiveSvg = Object.hasOwn(value, "activeSvg");
    const hasSelection = Object.hasOwn(value, "selection");
    if (
      (hasActiveSvg && hasSelection) ||
      Object.keys(value).length !== (hasActiveSvg || hasSelection ? 4 : 3) ||
      typeof truncated !== "boolean" ||
      !Array.isArray(open) ||
      open.length > MAX_OPEN
    )
      return null;
    const paths: unknown[] = [...open];
    if (
      !paths.every(isPath) ||
      new Set(paths).size !== paths.length ||
      (active !== null && (!isPath(active) || !paths.includes(active)))
    )
      return null;
    let selection: Selection | undefined;
    if (hasActiveSvg) {
      const path = record.activeSvg;
      if (!isActiveSvg(active, path)) return null;
      selection = path;
    } else if (hasSelection) {
      const subject = NativeEditorSelection.subject(record.selection);
      if (
        !subject ||
        !isSelectionInView(active, paths.length, truncated, subject)
      )
        return null;
      selection = subject;
    }
    if (snapshotBytes(active, paths, selection) > MAX_SNAPSHOT_BYTES)
      return null;
    return Object.freeze({
      active,
      open: Object.freeze(paths),
      truncated,
      ...selectionFields(selection),
    });
  }
}

export type NativeEditorSurfaceSnapshot = Readonly<{
  active: string | null;
  open: readonly string[];
  truncated: boolean;
}>;

export type NativeEditorSurfaceOpen = Readonly<{
  path: string;
  revision: number;
  expiresAtMs: number;
}>;

export namespace NativeEditorSurfaces {
  const MAX_OPEN = 50;
  const MAX_PATH_BYTES = 4096;
  const MAX_SNAPSHOT_BYTES = 16 * 1024;
  const encoder = new TextEncoder();

  function bytes(value: string): number {
    return encoder.encode(value).byteLength;
  }

  export function isPath(value: unknown): value is string {
    return (
      typeof value === "string" &&
      value.length <= MAX_PATH_BYTES &&
      value.startsWith("/") &&
      !value.includes("\0") &&
      !/[\\\uD800-\uDFFF]/u.test(value) &&
      value
        .slice(1)
        .split("/")
        .every((part) => part && part !== "." && part !== "..") &&
      bytes(value) <= MAX_PATH_BYTES
    );
  }

  /** Keep the active artifact and preserve the order of retained tabs. */
  export function capture(
    source: Pick<NativeEditorSurfaceSnapshot, "active" | "open">
  ): NativeEditorSurfaceSnapshot {
    const active =
      isPath(source.active) && source.open.includes(source.active)
        ? source.active
        : null;
    const open: string[] = [];
    let truncated = source.active !== active;
    let reserved = active !== null;
    const itemBytes = (path: string) => bytes(JSON.stringify(path)) + 1;
    // The first list entry does not need a comma.
    let length = bytes(JSON.stringify([active, []])) - 1;
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
    return { active, open, truncated };
  }

  /** Accept only the bounded presentation projection across the native bridge. */
  export function parse(value: unknown): NativeEditorSurfaceSnapshot | null {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const { active, open, truncated } = value as Record<string, unknown>;
    if (
      Object.keys(value).length !== 3 ||
      typeof truncated !== "boolean" ||
      !Array.isArray(open) ||
      open.length > MAX_OPEN
    )
      return null;
    const paths: unknown[] = [...open];
    if (
      !paths.every(isPath) ||
      new Set(paths).size !== paths.length ||
      (active !== null && (!isPath(active) || !paths.includes(active))) ||
      bytes(JSON.stringify([active, paths])) > MAX_SNAPSHOT_BYTES
    )
      return null;
    return Object.freeze({ active, open: Object.freeze(paths), truncated });
  }
}

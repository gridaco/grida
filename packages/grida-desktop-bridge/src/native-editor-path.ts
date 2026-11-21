const MAX_PATH_BYTES = 4096;
const encoder = new TextEncoder();

export function isEditorPath(value: unknown): value is string {
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
    encoder.encode(value).byteLength <= MAX_PATH_BYTES
  );
}

export function isEditorSvgPath(value: unknown): value is string {
  return isEditorPath(value) && value.toLowerCase().endsWith(".svg");
}

/** A literal descendant path. The caller verifies workspace/bundle authority. */
export function isEditorBundleMember(
  boardPath: unknown,
  path: string
): boardPath is string {
  return (
    isEditorPath(boardPath) &&
    boardPath.toLowerCase().endsWith(".canvas") &&
    path.startsWith(`${boardPath}/`)
  );
}

import type { NativeChatCommandAction } from "@grida/desktop-bridge";
import { NativeAgentHistory } from "./native-agent-history";

const MAX_ACTIONS = 16;
const MAX_FIELD_BYTES = 1024;

/** An incomplete or unrecognized projection falls back to the command details. */
export function readCommandActions(
  title: string,
  value: unknown
): readonly NativeChatCommandAction[] | undefined {
  if (
    title !== "exec_command" ||
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_ACTIONS
  )
    return undefined;
  const actions: NativeChatCommandAction[] = [];
  for (const entry of value) {
    const row = NativeAgentHistory.object(entry);
    if (!row) return undefined;
    const { kind, path, query, piped } = row;
    if (path !== undefined && !boundedText(path)) return undefined;
    if (piped !== undefined && piped !== true) return undefined;
    if (kind === "read" && path !== undefined) {
      if (piped) return undefined;
      actions.push(Object.freeze({ kind, path }));
    } else if (kind === "list_files") {
      actions.push(
        Object.freeze({
          kind,
          ...(path !== undefined && { path }),
          ...(piped && { piped }),
        })
      );
    } else if (kind === "search" && boundedText(query)) {
      actions.push(
        Object.freeze({
          kind,
          query,
          ...(path !== undefined && { path }),
          ...(piped && { piped }),
        })
      );
    } else {
      return undefined;
    }
  }
  return Object.freeze(actions);
}

function boundedText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value) <= MAX_FIELD_BYTES
  );
}

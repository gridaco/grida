import type { NativeEditorSurfaceSnapshot } from "@grida/desktop-bridge";
import type { NativeDesktopTools } from "./native-desktop-tools";

export namespace DesktopWorkbenchInventory {
  export const revision = 2;

  export const definition = {
    name: "surface_list_open",
    description:
      "Read the workspace editor's currently active file and open files. Paths are relative to the workspace root, shown with a leading slash.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: {
        interactive: { const: true },
        active: { type: ["string", "null"] },
        open: { type: "array", items: { type: "string" }, maxItems: 50 },
        truncated: { type: "boolean" },
      },
      required: ["interactive", "active", "open", "truncated"],
      additionalProperties: false,
    },
  } as const;

  export function bind(
    snapshot: NativeEditorSurfaceSnapshot | undefined
  ): NativeDesktopTools.Tool {
    return {
      definition,
      revision,
      invoke: (args) => {
        const result = invoke(args, snapshot);
        return !result.isError && snapshot?.truncated
          ? { ...result, _meta: { "co.grida/truncated": true } }
          : result;
      },
    };
  }

  export function invoke(
    args: unknown,
    snapshot: NativeEditorSurfaceSnapshot | undefined
  ) {
    if (
      args !== undefined &&
      (!args ||
        typeof args !== "object" ||
        Array.isArray(args) ||
        Object.keys(args).length !== 0)
    )
      return failure("invalid_editor_surface_arguments");
    if (!snapshot) return failure("editor_surface_endpoint_unavailable");
    return {
      content: [],
      structuredContent: { interactive: true, ...tabs(snapshot) },
      isError: false,
    };
  }

  export function tabs({
    active,
    open,
    truncated,
  }: NativeEditorSurfaceSnapshot) {
    return { active, open, truncated };
  }

  function failure(text: string) {
    return { content: [{ type: "text" as const, text }], isError: true };
  }
}

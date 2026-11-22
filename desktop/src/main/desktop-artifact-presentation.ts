// GRIDA-SEC-004 — file presentation is scoped to one admitted workbench.
import {
  NativeEditorSurfaces,
  NativeEditorSvgText,
} from "@grida/desktop-bridge";
import { NativeDesktopTools } from "./native-desktop-tools";

export namespace DesktopArtifactPresentation {
  const definition = {
    name: "surface_open",
    description:
      "Ask the attached workspace editor to open an existing artifact. Acknowledgment confirms a request was sent, and display is best effort.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", minLength: 2, maxLength: 4096 } },
      required: ["path"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        requested: { type: "boolean" },
        reason: { enum: ["dispatched", "editor_unavailable"] },
      },
      required: ["path", "requested", "reason"],
      additionalProperties: false,
    },
  } as const;

  export function bind(
    present: (path: string, callId: string, expiresAtMs: number) => boolean
  ): NativeDesktopTools.Tool {
    return {
      definition,
      revision: 2,
      invoke(args, call) {
        if (
          !args ||
          Object.keys(args).length !== 1 ||
          !NativeEditorSurfaces.isPath(args.path) ||
          !NativeEditorSvgText.isId(call.id)
        )
          return NativeDesktopTools.failure("invalid_surface_path");
        call.signal.throwIfAborted();
        const path = args.path;
        const requested = present(path, call.id, call.expiresAtMs);
        return {
          content: [],
          structuredContent: {
            path,
            requested,
            reason: requested ? "dispatched" : "editor_unavailable",
          },
          isError: false,
        };
      },
    };
  }
}

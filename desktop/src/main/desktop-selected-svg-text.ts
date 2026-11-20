// GRIDA-SEC-004 — only expose and dispatch an admitted selection capture.
import { NativeEditorSvgText } from "@grida/desktop-bridge";
import { NativeDesktopTools } from "./native-desktop-tools";

export namespace DesktopSelectedSvgText {
  export type Delivery = (
    request: NativeEditorSvgText.Request & { callId: string },
    signal?: AbortSignal
  ) => Promise<NativeEditorSvgText.Result>;

  const read = {
    name: "svg_read_selected_text",
    description:
      "Read the selected plain text in the SVG captured when this workspace Act message was sent. The revision is valid only while the exact view, document and selection remain current.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: {
        kind: { const: "read" },
        path: { type: "string" },
        revision: { type: "string" },
        text: { type: "string" },
      },
      required: ["kind", "path", "revision", "text"],
      additionalProperties: false,
    },
  } as const;
  const replace = {
    name: "svg_replace_selected_text",
    description:
      "Replace the captured selected SVG text using the revision from svg_read_selected_text. The live edit is undoable and leaves saving to the editor's normal Save action.",
    inputSchema: {
      type: "object",
      properties: {
        revision: { type: "string", maxLength: 36 },
        text: { type: "string", maxLength: 4096 },
      },
      required: ["revision", "text"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        kind: { enum: ["applied", "unchanged"] },
        path: { type: "string" },
        saved: { const: false },
      },
      required: ["kind", "path", "saved"],
      additionalProperties: false,
    },
  } as const;

  export function bind(
    targetId: string,
    deliver: Delivery
  ): readonly NativeDesktopTools.Tool[] {
    return [
      {
        definition: read,
        revision: 1,
        invoke: (args, call) => {
          if (args && Object.keys(args).length !== 0)
            return NativeDesktopTools.failure("invalid_svg_text_arguments");
          return invoke({ kind: "read" }, call);
        },
      },
      {
        definition: replace,
        revision: 1,
        invoke: (args, call) => {
          const action = NativeEditorSvgText.operation({
            ...args,
            kind: "replace",
          });
          if (
            !args ||
            Object.keys(args).length !== 2 ||
            action?.kind !== "replace"
          )
            return NativeDesktopTools.failure("invalid_svg_text_arguments");
          if (action.revision !== targetId)
            return NativeDesktopTools.failure("svg_text_revision_changed");
          return invoke(action, call);
        },
      },
    ];

    async function invoke(
      operation: NativeEditorSvgText.Operation,
      call: NativeDesktopTools.Invocation
    ) {
      if (!NativeEditorSvgText.isId(call.id))
        return NativeDesktopTools.failure("invalid_svg_text_arguments");
      call.signal.throwIfAborted();
      const result = NativeEditorSvgText.result(
        await deliver(
          {
            targetId,
            operation,
            callId: call.id,
            expiresAtMs: Math.min(call.expiresAtMs, Date.now() + 1500),
          },
          call.signal
        )
      );
      call.signal.throwIfAborted();
      if (result?.kind === "unavailable")
        return NativeDesktopTools.failure("svg_text_endpoint_unavailable");
      if (operation.kind === "replace" && result?.kind === "stale")
        return NativeDesktopTools.failure("svg_text_revision_changed");
      if (
        (operation.kind === "read" &&
          result?.kind === "read" &&
          result.revision === targetId) ||
        (operation.kind === "replace" &&
          (result?.kind === "applied" || result?.kind === "unchanged"))
      )
        return { content: [], structuredContent: result, isError: false };
      throw new Error("native_chat_svg_text_unverified");
    }
  }
}

// GRIDA-SEC-004 — only expose and dispatch an admitted selection capture.
import { NativeEditorSvgText } from "@grida/desktop-bridge";
import { DesktopSelectedSvgSelection } from "./desktop-selected-svg-selection";
import { NativeDesktopTools } from "./native-desktop-tools";

export namespace DesktopSelectedSvgText {
  export type Delivery = (
    request: NativeEditorSvgText.Request & { callId: string },
    signal?: AbortSignal
  ) => Promise<NativeEditorSvgText.Result>;

  export function bind(
    targetId: string,
    deliver: Delivery
  ): readonly NativeDesktopTools.Tool[] {
    return [
      {
        definition: DesktopSelectedSvgSelection.readText,
        revision: 1,
        invoke: (args, call) => {
          if (args && Object.keys(args).length !== 0)
            return NativeDesktopTools.failure("invalid_svg_text_arguments");
          return invoke({ kind: "read" }, call);
        },
      },
      {
        definition: DesktopSelectedSvgSelection.replaceText,
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

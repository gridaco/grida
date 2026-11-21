// GRIDA-SEC-004 — the tools operate only on the admitted live selection.
import {
  NativeEditorSvgSelection,
  NativeEditorSvgText,
} from "@grida/desktop-bridge";
import { NativeDesktopTools } from "./native-desktop-tools";

export namespace DesktopSelectedSvgSelection {
  export type Delivery = (
    request: NativeEditorSvgSelection.Request & { callId: string },
    signal: AbortSignal
  ) => Promise<NativeEditorSvgSelection.Result>;

  const revision = { type: "string", minLength: 36, maxLength: 36 } as const;
  const cursor = {
    type: "object",
    properties: {
      revision,
      offset: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    },
    required: ["revision", "offset"],
    additionalProperties: false,
  } as const;
  const inspect = {
    name: "svg_inspect_selection",
    description:
      "Inspect the exact SVG elements or vector points selected when this Act message was sent. Returns the scoped file path, capture revision and zero-based element-child paths or vector ordinals. Pass nextCursor as cursor to continue. Use the revision to edit the same live selection.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: { cursor },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        kind: { const: "inspection" },
        path: { type: "string" },
        revision,
        mode: { enum: ["objects", "vector"] },
        total: { type: "integer", minimum: 1 },
        targets: {
          type: "array",
          maxItems: NativeEditorSvgSelection.MAX_PAGE_ITEMS,
          items: { type: "object" },
        },
        vectorElement: { type: "object" },
        nextCursor: { anyOf: [cursor, { type: "null" }] },
      },
      required: [
        "kind",
        "path",
        "revision",
        "mode",
        "total",
        "targets",
        "nextCursor",
      ],
      additionalProperties: false,
    },
  } as const;
  const opacity = {
    name: "svg_set_selection_opacity",
    description:
      "Set opacity on the exact SVG objects inspected for this Act message. Pass the revision from svg_inspect_selection and an opacity from 0 to 1. This live edit is one Undo step and remains unsaved. Vector point selections are unsupported.",
    inputSchema: {
      type: "object",
      properties: {
        revision,
        opacity: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["revision", "opacity"],
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
      bindOperation(inspect, "inspect"),
      bindOperation(opacity, "set-opacity"),
    ];

    function bindOperation(
      definition: NativeDesktopTools.Tool["definition"],
      kind: NativeEditorSvgSelection.Operation["kind"]
    ): NativeDesktopTools.Tool {
      return {
        definition,
        revision: 1,
        async invoke(args, call) {
          const action = NativeEditorSvgSelection.operation({ ...args, kind });
          if (
            !action ||
            (args && Object.hasOwn(args, "kind")) ||
            !NativeEditorSvgText.isId(call.id)
          )
            return NativeDesktopTools.failure(
              "invalid_svg_selection_arguments"
            );
          if (
            (action.kind === "set-opacity" && action.revision !== targetId) ||
            (action.kind === "inspect" &&
              action.cursor &&
              action.cursor.revision !== targetId)
          )
            return NativeDesktopTools.failure("svg_selection_stale");
          call.signal.throwIfAborted();
          const result = NativeEditorSvgSelection.result(
            await deliver(
              {
                targetId,
                callId: call.id,
                expiresAtMs: call.expiresAtMs,
                operation: action,
              },
              call.signal
            )
          );
          call.signal.throwIfAborted();
          if (result?.kind === "stale")
            return NativeDesktopTools.failure("svg_selection_stale");
          if (result?.kind === "unavailable")
            return NativeDesktopTools.failure("svg_selection_unavailable");
          if (result?.kind === "unsupported")
            return NativeDesktopTools.failure("svg_selection_unsupported");
          if (
            (action.kind === "inspect" &&
              result?.kind === "inspection" &&
              verifiedPage(result, targetId, action.cursor?.offset ?? 0)) ||
            (action.kind === "set-opacity" &&
              (result?.kind === "applied" || result?.kind === "unchanged"))
          )
            return { content: [], structuredContent: result, isError: false };
          throw new Error("native_chat_svg_selection_unverified");
        },
      };
    }
  }

  function verifiedPage(
    result: NativeEditorSvgSelection.Inspection,
    targetId: string,
    offset: number
  ): boolean {
    const end = offset + result.targets.length;
    return (
      result.revision === targetId &&
      (result.nextCursor === null
        ? end === result.total
        : result.nextCursor.offset === end)
    );
  }
}

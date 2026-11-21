// GRIDA-SEC-004 — the tools operate only on the admitted live selection.
import { NativeEditorSelection } from "@grida/desktop-bridge";
import { NativeDesktopTools } from "./native-desktop-tools";

export namespace DesktopSelectedSvgSelection {
  export type Delivery = (
    request: NativeEditorSelection.Request & { callId: string },
    signal: AbortSignal
  ) => Promise<NativeEditorSelection.Result>;

  const revision = { type: "string", minLength: 36, maxLength: 36 } as const;
  const mutation = {
    type: "object",
    properties: {
      kind: { enum: ["applied", "unchanged"] },
      path: { type: "string" },
      saved: { const: false },
    },
    required: ["kind", "path", "saved"],
    additionalProperties: false,
  } as const;
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
      "Inspect the exact SVG selection captured at Send. An open SVG can provide element paths or vector points. A selected board item provides the whole SVG document path and its placement identity. Pass nextCursor as cursor to continue. Use the revision for supported live SVG edits.",
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
        mode: { enum: ["objects", "vector", "document"] },
        total: { type: "integer", minimum: 1 },
        targets: {
          type: "array",
          maxItems: NativeEditorSelection.MAX_PAGE_ITEMS,
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
    outputSchema: mutation,
  } as const;
  export const readText = {
    name: "svg_read_selected_text",
    description:
      "Read the string from one plain text element in the captured SVG selection. The revision is valid only while the exact view, document and selection remain current.",
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
  export const replaceText = {
    name: "svg_replace_selected_text",
    description:
      "Replace one plain text element in the captured SVG selection using the revision from svg_read_selected_text. The live edit is undoable and leaves writing to the editor's normal Save action.",
    inputSchema: {
      type: "object",
      properties: {
        revision: { type: "string", maxLength: 36 },
        text: {
          type: "string",
          maxLength: NativeEditorSelection.MAX_TEXT_BYTES,
        },
      },
      required: ["revision", "text"],
      additionalProperties: false,
    },
    outputSchema: mutation,
  } as const;

  export function bind(
    targetId: string,
    deliver: Delivery,
    {
      subject,
      supportsText = false,
    }: {
      subject?: NativeEditorSelection.Subject;
      supportsText?: boolean;
    } = {}
  ): readonly NativeDesktopTools.Tool[] {
    const tools = [bindOperation(inspect, "inspect")];
    if (subject?.kind === "document") return tools;
    tools.push(bindOperation(opacity, "set-opacity"));
    if (supportsText) {
      tools.push(
        bindOperation(readText, "read-text"),
        bindOperation(replaceText, "replace-text")
      );
    }
    return tools;

    function bindOperation(
      definition: NativeDesktopTools.Tool["definition"],
      kind: NativeEditorSelection.Operation["kind"]
    ): NativeDesktopTools.Tool {
      return {
        definition,
        revision: 1,
        async invoke(args, call) {
          const action = NativeEditorSelection.operation({ ...args, kind });
          if (
            !action ||
            (args && Object.hasOwn(args, "kind")) ||
            !NativeEditorSelection.isId(call.id)
          )
            return NativeDesktopTools.failure(
              "invalid_svg_selection_arguments"
            );
          if (
            ("revision" in action && action.revision !== targetId) ||
            (action.kind === "inspect" &&
              action.cursor &&
              (action.cursor.revision !== targetId ||
                (subject?.kind === "document" && action.cursor.offset !== 0)))
          )
            return NativeDesktopTools.failure("svg_selection_stale");
          call.signal.throwIfAborted();
          const result = NativeEditorSelection.result(
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
            action.kind === "read-text" &&
            result?.kind === "text" &&
            result.revision === targetId
          ) {
            return {
              content: [],
              structuredContent: { ...result, kind: "read" },
              isError: false,
            };
          }
          if (
            (action.kind === "inspect" &&
              result?.kind === "inspection" &&
              verifiedPage(
                result,
                targetId,
                action.cursor?.offset ?? 0,
                subject
              )) ||
            ((action.kind === "set-opacity" ||
              action.kind === "replace-text") &&
              (result?.kind === "applied" || result?.kind === "unchanged"))
          )
            return { content: [], structuredContent: result, isError: false };
          throw new Error("native_chat_svg_selection_unverified");
        },
      };
    }
  }

  function verifiedPage(
    result: NativeEditorSelection.Inspection,
    targetId: string,
    offset: number,
    subject: NativeEditorSelection.Subject | undefined
  ): boolean {
    if (
      !subject ||
      result.revision !== targetId ||
      result.path !== subject.path
    )
      return false;
    if (result.mode === "document") {
      const { placement } = result.targets[0];
      return (
        offset === 0 &&
        NativeEditorSelection.sameSubject(subject, {
          kind: "document",
          path: result.path,
          ...(placement && {
            placement: {
              boardPath: placement.boardPath,
              pinId: placement.pinId,
            },
          }),
        })
      );
    }
    const end = offset + result.targets.length;
    return (
      subject.kind === "svg" &&
      (result.nextCursor === null
        ? end === result.total
        : result.nextCursor.offset === end)
    );
  }
}

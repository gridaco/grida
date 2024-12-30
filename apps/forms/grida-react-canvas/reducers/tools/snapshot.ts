import type {
  IDocumentEditorState,
  IMinimalDocumentState,
} from "@/grida-react-canvas/state";

/**
 * @deprecated
 *
 * Dangerous. Use when absolutely necessary.
 *
 * @returns
 */
export function createMinimalDocumentStateSnapshot(
  state: IDocumentEditorState
) {
  const minimal: IMinimalDocumentState = {
    document: state.document,
    document_ctx: state.document_ctx,
    document_key: state.document_key,
  };

  return JSON.parse(JSON.stringify(minimal));
}

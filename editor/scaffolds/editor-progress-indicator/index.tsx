import { EditorProgressIndicator as Base } from "components/editor-progress-indicator";
import { useDispatch } from "core/dispatch";
import { useEditorState, useWorkspace } from "core/states";

export function EditorProgressIndicator() {
  const { taskQueue } = useWorkspace();

  return <Base {...taskQueue} />;
}

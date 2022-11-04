import { EditorProgressIndicator as Base } from "components/editor-progress-indicator";
import { useDispatch } from "core/dispatch";
import { useEditorState } from "core/states";

export function EditorProgressIndicator() {
  const dispatch = useDispatch();
  const [state] = useEditorState();

  const { editorTaskQueue } = state;

  return <Base {...editorTaskQueue} />;
}

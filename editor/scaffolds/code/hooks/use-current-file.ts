import { useEditorState } from "core/states";

export function useCurrentFile() {
  const [state] = useEditorState();
  const { selectedNodes } = state;
  const { files } = state.code;
  const file = files[selectedNodes[0]];
  return file;
}

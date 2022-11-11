import { useEditorState } from "core/states";
import type { File } from "@grida/builder-config/output/output-file";

export function useCurrentFile<T extends File = File>(): T {
  const [state] = useEditorState();
  const { selectedNodes } = state;
  const { files } = state.code;
  const file = files[selectedNodes[0]];
  return file as T;
}

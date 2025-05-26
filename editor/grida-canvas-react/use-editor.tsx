import * as React from "react";
import { Editor } from "@/grida-canvas/editor";
import { useSyncExternalStore } from "use-sync-external-store/shim";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/shim/with-selector";
import { EditorRecorder } from "@/grida-canvas/plugins/recorder";
import type { editor } from "@/grida-canvas";
import deepEqual from "fast-deep-equal/es6/react.js";

export function useEditor(init: editor.state.IEditorStateInit) {
  const [_editor] = React.useState(new Editor(init));

  const editor = useSyncExternalStore<Editor>(
    _editor.subscribe.bind(_editor),
    () => _editor,
    () => _editor
  );

  React.useDebugValue(editor);

  return editor;
}

export const EditorContext = React.createContext<Editor | null>(null);

export function useCurrentEditor() {
  const editor = React.useContext(EditorContext);
  if (!editor) {
    throw new Error(
      "useCurrentEditor must be used within an EditorContextV2.Provider"
    );
  }
  return editor;
}

export function useEditorState<Selected>(
  editor: Editor,
  selector: (state: editor.state.IEditorState) => Selected,
  isEqual: (a: Selected, b: Selected) => boolean = deepEqual
): Selected {
  return useSyncExternalStoreWithSelector(
    editor.subscribe.bind(editor),
    editor.getSnapshot.bind(editor),
    editor.getSnapshot.bind(editor), // for SSR fallback, can be same as getSnapshot
    selector,
    isEqual
  );
}

export function useRecorder() {
  const editor = useCurrentEditor();
  const [recorder] = React.useState(new EditorRecorder(editor));

  const start = React.useCallback(() => {
    recorder.start();
  }, [recorder]);

  const stop = React.useCallback(() => {
    recorder.stop();
  }, [recorder]);

  const flush = React.useCallback(() => {
    recorder.flush();
  }, [recorder]);

  const replay = React.useCallback(() => {
    recorder.replay();
  }, [recorder]);

  const exit = React.useCallback(() => {
    recorder.exit();
  }, [recorder]);

  const status = useSyncExternalStore(
    recorder.subscribeStatusChange.bind(recorder),
    recorder.getStatus.bind(recorder)
  );

  return {
    start,
    stop,
    flush,
    replay,
    status,
    exit,
  };
}

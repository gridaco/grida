import * as React from "react";
import { Editor, EditorContentRenderingBackend } from "@/grida-canvas/editor";
import { useSyncExternalStore } from "use-sync-external-store/shim";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/shim/with-selector";
import type { editor } from "@/grida-canvas";
import deepEqual from "fast-deep-equal/es6/react.js";
import {
  domapi,
  DOMGeometryQueryInterfaceProvider,
  NoopGeometryQueryInterfaceProvider,
} from "@/grida-canvas/backends";

const __DEFAULT_STATE: editor.state.IEditorStateInit = {
  debug: false,
  document: {
    nodes: {},
    entry_scene_id: "main",
    scenes: {
      main: {
        type: "scene",
        id: "main",
        name: "main",
        children: [],
        guides: [],
        constraints: { children: "multiple" },
      },
    },
  },
  editable: true,
};

export function useEditor(
  init?: editor.state.IEditorStateInit,
  backend: EditorContentRenderingBackend = "dom"
) {
  const [_editor] = React.useState(
    new Editor(
      backend,
      domapi.k.VIEWPORT_ELEMENT_ID,
      domapi.k.EDITOR_CONTENT_ELEMENT_ID,
      (_) => {
        switch (backend) {
          case "dom":
            return new DOMGeometryQueryInterfaceProvider(_);
          case "canvas":
            return new NoopGeometryQueryInterfaceProvider();
        }
      },
      init ?? __DEFAULT_STATE
    )
  );

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

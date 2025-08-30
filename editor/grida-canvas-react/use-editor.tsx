import * as React from "react";
import { Editor } from "@/grida-canvas/editor";
import { useSyncExternalStore } from "use-sync-external-store/shim";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/shim/with-selector";
import type { editor } from "@/grida-canvas";
import deepEqual from "fast-deep-equal/es6/react.js";
import {
  domapi,
  DOMGeometryQueryInterfaceProvider,
  DOMImageExportInterfaceProvider,
  DOMFontLoaderInterfaceProvider,
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
  backend: editor.EditorContentRenderingBackend = "dom"
) {
  const [_editor] = React.useState(() => {
    switch (backend) {
      case "dom": {
        return new Editor({
          backend: backend,
          viewportElement: domapi.k.VIEWPORT_ELEMENT_ID,
          contentElement: domapi.k.EDITOR_CONTENT_ELEMENT_ID,
          geometry: (_) => new DOMGeometryQueryInterfaceProvider(_),
          initialState: init ?? __DEFAULT_STATE,
          plugins: {
            export_as_image: (_) => new DOMImageExportInterfaceProvider(_),
            fonts: (_) => new DOMFontLoaderInterfaceProvider(_),
          },
        });
      }
      case "canvas": {
        return new Editor({
          backend: backend,
          viewportElement: domapi.k.VIEWPORT_ELEMENT_ID,
          contentElement: domapi.k.EDITOR_CONTENT_ELEMENT_ID,
          geometry: (_) => new NoopGeometryQueryInterfaceProvider(),
          initialState: init ?? __DEFAULT_STATE,
        });
      }
    }
  });

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

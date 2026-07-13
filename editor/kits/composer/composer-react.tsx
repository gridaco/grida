"use client";

import { cn } from "@app/ui/lib/utils";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import {
  createContext,
  type HTMLAttributes,
  type PropsWithChildren,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ComposerCore,
  type ComposerAttachment,
  type ComposerCatalog,
  type ComposerCommand,
  type ComposerEditorContext,
  type ComposerFileReference,
  type ComposerMention,
  type ComposerMessage,
  type ComposerSnapshot,
  type ComposerTrigger,
} from "./composer-core";
import { ComposerTiptap } from "./composer-tiptap";
import { ComposerTransfer } from "./composer-transfer";
import "./composer-content.css";

type ComposerContextValue = {
  core: ComposerCore;
  editor: Editor | null;
  setEditor: (editor: Editor | null) => void;
  snapshot: ComposerSnapshot;
  triggerMenuId: string;
};

export type ComposerController = {
  snapshot: ComposerViewSnapshot;
  trigger: ComposerTrigger | null;
  triggerIndex: number;
  addAttachment: ComposerCore["addAttachment"];
  removeAttachment: ComposerCore["removeAttachment"];
  setContexts: ComposerCore["setContexts"];
  clear: () => void;
  insertFileReference: (reference: ComposerFileReference) => boolean;
  setTriggerIndex: (index: number) => void;
  moveTriggerIndex: (delta: number) => void;
  selectTriggerItem: (index: number) => boolean;
  submit: (
    input: Parameters<ComposerCore["createMessage"]>[0]
  ) => ComposerMessage | null;
};

export type ComposerViewSnapshot = Pick<
  ComposerSnapshot,
  "attachments" | "contexts" | "text"
>;

const ComposerContext = createContext<ComposerContextValue | null>(null);

export function ComposerProvider({
  catalog,
  children,
}: PropsWithChildren<{
  catalog: ComposerCatalog;
}>) {
  const core = useRef<ComposerCore | null>(null);
  if (!core.current) {
    core.current = new ComposerCore(catalog);
  }
  const coreValue = core.current;
  const reactId = useId();
  const triggerMenuId = useMemo(
    () => `composer-trigger-menu-${reactId.replace(/:/g, "")}`,
    [reactId]
  );
  const [editor, setEditor] = useState<Editor | null>(null);

  useEffect(() => {
    coreValue.setCatalog(catalog);
  }, [catalog, coreValue]);

  const snapshot = useSyncExternalStore(
    (listener) => coreValue.subscribe(listener),
    () => coreValue.getSnapshot(),
    () => coreValue.getSnapshot()
  );

  const value = useMemo(
    () => ({
      core: coreValue,
      editor,
      setEditor,
      snapshot,
      triggerMenuId,
    }),
    [coreValue, editor, setEditor, snapshot, triggerMenuId]
  );

  return (
    <ComposerContext.Provider value={value}>
      {children}
    </ComposerContext.Provider>
  );
}

export function useComposer() {
  const { core, editor, snapshot } = useComposerInternals();

  return useMemo<ComposerController>(
    () => ({
      snapshot: toViewSnapshot(snapshot),
      trigger: snapshot.trigger,
      triggerIndex: snapshot.triggerIndex,
      addAttachment: core.addAttachment.bind(core),
      removeAttachment: core.removeAttachment.bind(core),
      setContexts: core.setContexts.bind(core),
      clear() {
        editor?.commands.clearContent(true);
        core.clear();
      },
      insertFileReference(reference) {
        if (!editor) return false;
        ComposerTiptap.insertFileReference(editor, reference);
        return true;
      },
      setTriggerIndex(index) {
        core.setTriggerIndex(index);
      },
      moveTriggerIndex(delta) {
        core.moveTriggerIndex(delta);
      },
      selectTriggerItem(index) {
        if (!editor || !snapshot.trigger) return false;
        ComposerTiptap.selectTriggerItem(editor, snapshot.trigger, index);
        return true;
      },
      submit(input) {
        if (editor) {
          ComposerTiptap.syncCore(core, editor);
        }
        return core.createMessage(input);
      },
    }),
    [core, editor, snapshot]
  );
}

export function useComposerInternals() {
  const context = useContext(ComposerContext);
  if (!context) {
    throw new Error("useComposer must be used inside ComposerProvider.");
  }
  return context;
}

export function ComposerContent({
  className,
  editorClassName,
  placeholder = "Compose...",
  triggerMenuId,
  autofocus,
  onSubmitRequest,
  onFiles,
  onDirectories,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "onSubmit"> & {
  placeholder?: string;
  autofocus?: boolean;
  editorClassName?: string;
  triggerMenuId?: string;
  onSubmitRequest?: () => void;
  /**
   * Forward files pasted or dropped onto the editor — ALL types (images and
   * arbitrary files alike). The kit stays policy-agnostic: it only hands over the
   * raw `File[]`; the consumer decides what counts (e.g. excludes SVG), how to
   * encode (perceive-inline image vs scratch upload), and whether to attach. When
   * provided AND files are present, the gesture is consumed; a text/HTML paste
   * with no files always falls through to the editor unchanged.
   */
  onFiles?: (files: File[]) => void;
  /**
   * Forward directories dropped from the operating system. Directory entries
   * are separated from ordinary files through `DataTransfer.items` entry
   * metadata — never MIME/size heuristics — and the original disk-backed
   * `File` reaches the callback unchanged. A host such as Electron can turn
   * that trusted gesture into an opaque read scope. Clipboard paste never
   * invokes this callback.
   */
  onDirectories?: (directories: File[]) => void;
}) {
  const {
    core,
    setEditor,
    snapshot,
    triggerMenuId: defaultTriggerMenuId,
  } = useComposerInternals();
  const resolvedTriggerMenuId = triggerMenuId ?? defaultTriggerMenuId;
  const editorRef = useRef<Editor | null>(null);
  // The editor is created once; read the latest callback through a ref so a
  // re-rendered consumer's handler is always the one invoked.
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;
  const onDirectoriesRef = useRef(onDirectories);
  onDirectoriesRef.current = onDirectories;
  const extensions = useMemo(
    () => ComposerTiptap.extensions({ placeholder }),
    [placeholder]
  );
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    editorProps: {
      attributes: {
        "data-composer-editor": "",
        "aria-autocomplete": "list",
        "aria-controls": resolvedTriggerMenuId,
        "aria-expanded": "false",
        class: cn("outline-none", editorClassName),
      },
      handleKeyDown(_view, event) {
        return ComposerTiptap.handleKeyDown({
          core,
          editor: editorRef.current,
          event,
          triggerIndex: core.getSnapshot().triggerIndex,
          moveTriggerIndex: (delta) => core.moveTriggerIndex(delta),
          submit() {
            onSubmitRequest?.();
          },
        });
      },
      handlePaste(_view, event) {
        const handler = onFilesRef.current;
        if (!handler) return false;
        const files = ComposerTransfer.pasteFiles(event.clipboardData);
        if (files.length === 0) return false;
        handler(files);
        return true;
      },
      handleDrop(_view, event) {
        const dropped = ComposerTransfer.splitDrop(event.dataTransfer);
        let handled = false;
        if (dropped.files.length > 0 && onFilesRef.current) {
          onFilesRef.current(dropped.files);
          handled = true;
        }
        if (dropped.directories.length > 0 && onDirectoriesRef.current) {
          onDirectoriesRef.current(dropped.directories);
          handled = true;
        }
        return handled;
      },
    },
    onCreate({ editor }) {
      editorRef.current = editor;
      setEditor(editor);
      ComposerTiptap.syncCore(core, editor);
      if (autofocus) {
        editor.commands.focus("end");
      }
    },
    onUpdate({ editor }) {
      ComposerTiptap.syncCore(core, editor);
    },
    onSelectionUpdate({ editor }) {
      ComposerTiptap.inspectCore(core, editor);
    },
    onDestroy() {
      editorRef.current = null;
      setEditor(null);
    },
  });

  // Keep the placeholder reactive. `useEditor` builds the editor once, so a
  // changed `placeholder` prop never reconfigures the Placeholder extension on
  // its own — the rendered `data-placeholder` would stay frozen at first mount
  // (e.g. the desktop home switching modes). Update the extension's option in
  // place and dispatch a no-op transaction so ProseMirror recomputes the
  // placeholder decoration, preserving focus, selection, and the draft (unlike
  // recreating the editor, which would also thrash on any rotation).
  useEffect(() => {
    if (!editor) return;
    const ext = editor.extensionManager.extensions.find(
      (e) => e.name === "placeholder"
    );
    if (!ext || ext.options.placeholder === placeholder) return;
    ext.options.placeholder = placeholder;
    editor.view.dispatch(editor.state.tr);
  }, [editor, placeholder]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const selectedItem = snapshot.trigger?.items[snapshot.triggerIndex];
    dom.setAttribute("aria-controls", resolvedTriggerMenuId);
    dom.setAttribute("aria-expanded", snapshot.trigger ? "true" : "false");
    if (snapshot.trigger && selectedItem) {
      dom.setAttribute(
        "aria-activedescendant",
        `${resolvedTriggerMenuId}-${snapshot.trigger.kind}-${selectedItem.id}`
      );
    } else {
      dom.removeAttribute("aria-activedescendant");
    }
  }, [editor, resolvedTriggerMenuId, snapshot.trigger, snapshot.triggerIndex]);

  return (
    <div
      {...props}
      className={cn("composer-content", className)}
      data-composer-content
    >
      <EditorContent editor={editor} />
    </div>
  );
}

function toViewSnapshot(snapshot: ComposerSnapshot): ComposerViewSnapshot {
  return {
    attachments: snapshot.attachments,
    contexts: snapshot.contexts,
    text: snapshot.text,
  };
}

export type {
  ComposerAttachment,
  ComposerCatalog,
  ComposerCommand,
  ComposerEditorContext,
  ComposerFileReference,
  ComposerMention,
  ComposerMessage,
};

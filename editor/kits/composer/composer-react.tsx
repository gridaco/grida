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
  submit: (input: { submitted_at: number }) => ComposerMessage | null;
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
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "onSubmit"> & {
  placeholder?: string;
  autofocus?: boolean;
  editorClassName?: string;
  triggerMenuId?: string;
  onSubmitRequest?: () => void;
}) {
  const {
    core,
    setEditor,
    snapshot,
    triggerMenuId: defaultTriggerMenuId,
  } = useComposerInternals();
  const resolvedTriggerMenuId = triggerMenuId ?? defaultTriggerMenuId;
  const editorRef = useRef<Editor | null>(null);
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

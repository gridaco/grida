"use client";

import { Kbd } from "@app/ui/components/kbd";
import { cn } from "@app/ui/lib/utils";
import type { JSONContent } from "@tiptap/core";
import markdownStyles from "@/components/chat-markdown.module.css";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import {
  createContext,
  type HTMLAttributes,
  type MouseEventHandler,
  type PropsWithChildren,
  type RefObject,
  useContext,
  useEffect,
  useLayoutEffect,
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
import { ComposerFormattingMenu } from "./composer-formatting-menu";
import { ComposerTiptap } from "./composer-tiptap";
import { ComposerTiptapHistory } from "./composer-tiptap-history";
import type { ComposerHistory } from "./composer-history";
import { ComposerTransfer } from "./composer-transfer";
import "@/components/chat-web-link.css";
import "./composer-content.css";

type ComposerContextValue = {
  core: ComposerCore;
  editor: Editor | null;
  setEditor: (editor: Editor | null) => void;
  snapshot: ComposerSnapshot;
  triggerMenuId: string;
  commandSelection: RefObject<
    ((command: ComposerCommand) => boolean) | undefined
  >;
};

export type ComposerController = {
  /** Whether the editor is mounted and can accept document operations. */
  ready: boolean;
  snapshot: ComposerViewSnapshot;
  trigger: ComposerTrigger | null;
  triggerIndex: number;
  addAttachment: ComposerCore["addAttachment"];
  removeAttachment: ComposerCore["removeAttachment"];
  setContexts: ComposerCore["setContexts"];
  clear: () => void;
  clearForHistory: (sent?: {
    draft: ComposerHistory.Draft;
    text: string;
  }) => void;
  readHistoryDraft: () => ComposerHistory.Draft | undefined;
  guardHistoryDocument: () => () => boolean;
  configureHistory: (binding: ComposerTiptapHistory.Binding) => void;
  /** Add a reversible non-text action to this editor's undo history. */
  recordHistoryEffect: (apply: (forward: boolean) => void) => boolean;
  /** Whether an inline suggestion can occupy the empty editable paragraph. */
  isEmptyDraft: () => boolean;
  /** The editor's document, or null when it is empty. */
  readDocument: () => unknown | null;
  /** Restore a saved document into an empty editor. False when not applied. */
  restoreDocument: (doc: unknown) => boolean;
  /** Append saved blocks to the current document. */
  appendDocument: (blocks: readonly unknown[]) => boolean;
  /** `onHistoryChange` receives true on append or redo, and false on undo. */
  appendText: (
    text: string,
    maxBytes: number,
    placement?: "paragraph" | "inline",
    onHistoryChange?: (forward: boolean) => void
  ) => boolean;
  /** Put the caret at the end of the draft. False before the editor exists. */
  focus: () => boolean;
  insertFileReference: (reference: ComposerFileReference) => boolean;
  setTriggerIndex: (index: number) => void;
  moveTriggerIndex: (delta: number) => void;
  dismissTrigger: () => void;
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
  onCommandSelect,
}: PropsWithChildren<{
  catalog: ComposerCatalog;
  /** Return true to handle an explicit command selection without inserting a chip. */
  onCommandSelect?: (command: ComposerCommand) => boolean;
}>) {
  const commandSelection = useRef(onCommandSelect);
  commandSelection.current = onCommandSelect;
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
  const pendingMention = snapshot.trigger?.pending
    ? snapshot.trigger
    : undefined;
  useEffect(() => {
    if (!pendingMention) return;
    const owner = new AbortController();
    const debounce = window.setTimeout(
      () => void coreValue.resolveMentions(owner.signal),
      80
    );
    return () => {
      window.clearTimeout(debounce);
      owner.abort();
    };
  }, [coreValue, pendingMention]);

  const value = useMemo(
    () => ({
      core: coreValue,
      editor,
      setEditor,
      snapshot,
      triggerMenuId,
      commandSelection,
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
  const { core, editor, snapshot, commandSelection } = useComposerInternals();

  return useMemo<ComposerController>(
    () => ({
      ready: editor !== null,
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
      clearForHistory(sent) {
        if (editor) ComposerTiptapHistory.for(editor).clear(sent);
        core.clear();
      },
      readHistoryDraft() {
        return editor ? ComposerTiptapHistory.for(editor).read() : undefined;
      },
      guardHistoryDocument() {
        return editor
          ? ComposerTiptapHistory.for(editor).guardDocument()
          : () => false;
      },
      configureHistory(binding) {
        if (editor) ComposerTiptapHistory.for(editor).configure(binding);
      },
      recordHistoryEffect(apply) {
        if (!editor || editor.isDestroyed) return false;
        ComposerTiptapHistory.for(editor).recordStandaloneEffect(apply);
        return true;
      },
      isEmptyDraft() {
        const current = core.getSnapshot();
        return (
          !!editor &&
          !editor.view.composing &&
          ComposerTiptap.hasEmptyParagraph(editor) &&
          !current.attachments.length &&
          !current.contexts.length
        );
      },
      readDocument() {
        return editor && !editor.isEmpty ? editor.getJSON() : null;
      },
      restoreDocument(doc) {
        if (!editor || !editor.isEmpty) return false;
        try {
          ComposerTiptapHistory.for(editor).restore(doc);
        } catch {
          return false;
        }
        ComposerTiptap.syncCore(core, editor);
        return true;
      },
      appendDocument(blocks) {
        if (!editor || editor.isDestroyed) return false;
        const transaction = ComposerTiptap.appendDocument(editor.state, blocks);
        if (!transaction) return false;
        editor.view.dispatch(transaction);
        return true;
      },
      appendText(text, maxBytes, placement, onHistoryChange) {
        return (
          !!editor &&
          ComposerTiptap.appendText(
            editor,
            text,
            maxBytes,
            placement,
            onHistoryChange
          )
        );
      },
      focus() {
        return !!editor && editor.commands.focus("end");
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
      dismissTrigger() {
        core.dismissTrigger();
      },
      selectTriggerItem(index) {
        if (!editor) return false;
        return ComposerTiptap.selectTriggerItem(
          editor,
          core,
          index,
          commandSelection.current
        );
      },
      submit(input) {
        if (editor) {
          ComposerTiptap.syncCore(core, editor);
        }
        const message = core.createMessage(input);
        if (message && editor) {
          const markdown = ComposerTiptap.formattedMarkdown(editor.state.doc);
          if (markdown !== undefined) message.meta.markdown = markdown;
        }
        return message;
      },
    }),
    [core, editor, snapshot, commandSelection]
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
  initialDocument,
  editorAriaLabel,
  onSubmitRequest,
  onPromptChange,
  onLinkClick,
  suggestion,
  onDraftChange,
  onTransfer,
  onFiles,
  onDirectories,
  readOnly = false,
  scrollFade = false,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "onSubmit"> & {
  placeholder?: string;
  autofocus?: boolean;
  /** The document to mount when the composer opens. */
  initialDocument?: JSONContent;
  editorAriaLabel?: string;
  /** Keep the mounted document visible while its submission is being confirmed. */
  readOnly?: boolean;
  /** Fade clipped content when the editor has a constrained height. */
  scrollFade?: boolean;
  editorClassName?: string;
  triggerMenuId?: string;
  onSubmitRequest?: () => void;
  /** The complete authored prompt after each document edit. */
  onPromptChange?: (text: string) => void;
  /** Optional handler for the formatting menu's Open link action. */
  onLinkClick?: MouseEventHandler<HTMLAnchorElement>;
  /** Faint text outside the document. Only plain Tab accepts the full text. */
  suggestion?: { text: string; take(text: string): boolean };
  /** Synchronous document and composition changes, including edits within one render. */
  onDraftChange?: (empty: boolean) => void;
  /**
   * Preferred source-aware transfer callback. Receives one envelope per paste or
   * drop, retaining gesture provenance, resource kind, ordering, and the original
   * browser `File` objects. When provided it supersedes the legacy `onFiles` and
   * `onDirectories` callbacks for that gesture.
   */
  onTransfer?: (event: ComposerTransfer.Event) => void;
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
    commandSelection,
    setEditor,
    snapshot,
    triggerMenuId: defaultTriggerMenuId,
  } = useComposerInternals();
  const resolvedTriggerMenuId = triggerMenuId ?? defaultTriggerMenuId;
  const editorRef = useRef<Editor | null>(null);
  // The editor is created once; read the latest callback through a ref so a
  // re-rendered consumer's handler is always the one invoked.
  const suggestionRef = useRef(suggestion);
  suggestionRef.current = suggestion;
  const draftChangeRef = useRef(onDraftChange);
  draftChangeRef.current = onDraftChange;
  const promptChangeRef = useRef(onPromptChange);
  promptChangeRef.current = onPromptChange;
  const submitRef = useRef(onSubmitRequest);
  submitRef.current = onSubmitRequest;
  const onTransferRef = useRef(onTransfer);
  onTransferRef.current = onTransfer;
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
    editable: !readOnly,
    content: initialDocument,
    extensions,
    editorProps: {
      attributes: {
        "data-composer-editor": "",
        "aria-autocomplete": "list",
        "aria-controls": resolvedTriggerMenuId,
        "aria-expanded": "false",
        ...(editorAriaLabel && { "aria-label": editorAriaLabel }),
        class: cn(
          "outline-none",
          scrollFade &&
            "data-[scroll-overflow]:scroll-fade-y scroll-fade-3 [--scroll-fade-reveal:0.75rem]",
          editorClassName
        ),
      },
      handleKeyDown(_view, event) {
        return ComposerTiptap.handleKeyDown({
          core,
          editor: editorRef.current,
          event,
          suggestion: suggestionRef.current,
          triggerIndex: core.getSnapshot().triggerIndex,
          moveTriggerIndex: (delta) => core.moveTriggerIndex(delta),
          submit() {
            submitRef.current?.();
          },
          onCommandSelect: commandSelection.current,
        });
      },
      handleClick(_view, _position, event) {
        const current = editorRef.current;
        return !!current && ComposerTiptap.selectPressedLink(current, event);
      },
      handleDOMEvents: {
        compositionstart() {
          draftChangeRef.current?.(false);
          return false;
        },
        compositionend() {
          const editor = editorRef.current;
          draftChangeRef.current?.(
            !!editor && ComposerTiptap.hasEmptyParagraph(editor)
          );
          return false;
        },
      },
      handlePaste(_view, event) {
        const transfer = ComposerTransfer.fromPaste(event.clipboardData);
        if (transfer.resources.length === 0) return false;
        if (onTransferRef.current) {
          onTransferRef.current(transfer);
          return true;
        }
        const { files } = ComposerTransfer.split(transfer);
        if (!onFilesRef.current || files.length === 0) return false;
        onFilesRef.current(files);
        return true;
      },
      handleDrop(_view, event) {
        const transfer = ComposerTransfer.fromDrop(event.dataTransfer);
        if (transfer.resources.length === 0) return false;
        if (onTransferRef.current) {
          onTransferRef.current(transfer);
          return true;
        }
        const dropped = ComposerTransfer.split(transfer);
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
    onUpdate({ editor, transaction }) {
      draftChangeRef.current?.(
        !editor.view.composing && ComposerTiptap.hasEmptyParagraph(editor)
      );
      ComposerTiptap.syncCore(core, editor);
      if (transaction.docChanged && promptChangeRef.current)
        promptChangeRef.current(
          ComposerTiptap.formattedMarkdown(editor.state.doc) ??
            editor.getText({ blockSeparator: "\n" })
        );
    },
    onSelectionUpdate({ editor }) {
      ComposerTiptap.inspectCore(core, editor);
    },
    onDestroy() {
      editorRef.current = null;
      setEditor(null);
    },
  });

  // Tiptap keeps the current editable flag when updating options on a mounted
  // editor. Apply read-only changes explicitly before another input event.
  useLayoutEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor || !scrollFade) return;

    const viewport = editor.view.dom;
    let frame = 0;
    const measureOverflow = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // Chromium can retain the last mask when a scroll timeline goes idle.
        viewport.toggleAttribute(
          "data-scroll-overflow",
          viewport.scrollHeight > viewport.clientHeight
        );
      });
    };
    const observer = new ResizeObserver(measureOverflow);
    observer.observe(viewport);
    editor.on("update", measureOverflow);
    return () => {
      editor.off("update", measureOverflow);
      observer.disconnect();
      cancelAnimationFrame(frame);
      viewport.removeAttribute("data-scroll-overflow");
    };
  }, [editor, scrollFade]);

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
    if (suggestion) {
      dom.setAttribute("aria-keyshortcuts", "Tab");
      dom.setAttribute(
        "aria-description",
        `Suggested prompt: ${suggestion.text}. Press Tab to edit it.`
      );
    } else {
      dom.removeAttribute("aria-keyshortcuts");
      dom.removeAttribute("aria-description");
    }
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
  }, [
    editor,
    resolvedTriggerMenuId,
    snapshot.trigger,
    snapshot.triggerIndex,
    suggestion,
  ]);

  return (
    <div
      {...props}
      className={cn("composer-content", markdownStyles.draft, className)}
      data-composer-content
      data-composer-suggestion={suggestion ? "" : undefined}
    >
      {suggestion && (
        <div
          className={cn("composer-suggestion", editorClassName)}
          aria-hidden="true"
        >
          <p
            className="composer-text-node composer-suggestion-lines"
            data-suggestion-text={suggestion.text}
          >
            <span className="composer-suggestion-inline">
              <span>{suggestion.text}</span>
              <Kbd className="ms-1 h-4 border border-current bg-transparent align-middle whitespace-nowrap text-inherit">
                <span>⇥</span>
                Tab
              </Kbd>
            </span>
          </p>
        </div>
      )}
      <EditorContent className="composer-editor" editor={editor} />
      {/* Tiptap moves the menu's DOM. Keep the menu mounted when completion
          opens or editability changes. */}
      {editor && (
        <div className="contents">
          <ComposerFormattingMenu
            editor={editor}
            disabled={readOnly || !!snapshot.trigger}
            onLinkClick={onLinkClick}
          />
        </div>
      )}
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

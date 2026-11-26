"use client";

/**
 * `AgentComposerInput` — the desktop agent chat's input, built on the
 * `@/kits/composer` Tiptap kit. Replaces the plain `PromptInputTextarea`
 * so the chat input gains slash `/` commands and `@` mentions
 * (workspace file references), plus light rich text.
 *
 * Headless-ish: the caller supplies the `catalog` (commands + mentions)
 * and optional start/end toolbar content, and receives the lowered prompt
 * text on submit. The composer owns trigger state + editing; this component
 * owns the surrounding frame + send/stop affordances. Attachments belong to
 * the host: dropped or pasted items go to `onAttachmentTransfer`, and staged
 * items render through `attachments`.
 *
 * Lowering: the prompt is the composer's formatted or plain text plus a list of
 * any referenced file paths (from `@`-mentions / file-ref parts) so the
 * agent can resolve them even when the chip text alone is ambiguous.
 */

import {
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import {
  ArrowUpIcon,
  LoaderCircleIcon,
  MicIcon,
  SquareIcon,
} from "lucide-react";
import { isDesktopVoiceReady } from "@grida/desktop-bridge";
import type { NativeChatSkillReference } from "@grida/desktop-bridge";
import type { NativeComposerPrediction } from "@/lib/agent-chat/native-composer-prediction";
import type { ComposerDrafts } from "@/lib/agent-chat/composer-drafts";
import { ComposerDraftBinding } from "@/lib/agent-chat/composer-draft-binding";
import {
  BrowserOpen,
  handleBrowserLinkClick,
} from "@/lib/desktop/browser-open-context";
import { AgentComposerEditSession } from "./agent-composer-edit-session";
import type { ComposerVoice } from "./composer-voice";
import {
  DictationActivity,
  DictationButton,
  DictationSetupButton,
  openVoiceSettings,
  useComposerVoice,
} from "./composer-dictation-controls";
import voiceStyles from "./composer-dictation.module.css";
import { EditorSelectionIndicator } from "@/kits/agent-chat/editor-selection-indicator";
import { Button } from "@app/ui/components/button";
import { cn } from "@app/ui/lib/utils";
import {
  ComposerAttachmentStrip,
  ComposerContent,
  ComposerHistory,
  ComposerMenuAnchor,
  ComposerProvider,
  ComposerToolbarTooltip,
  ComposerTransfer,
  ComposerTriggerMenu,
  composerToolbarButtonClassName,
  useComposer,
  type ComposerCatalog,
  type ComposerController,
} from "@/kits/composer";
import { AgentComposerSubmission } from "./agent-composer-submission";
import { WorkspaceFileIcon } from "../workbench/workspace-file-icon";

const ESCAPE_CONFIRM_MS = 2000;
const MAX_DICTATION_DRAFT_BYTES = 512 * 1024;
const toolbarIconClassName = cn(composerToolbarButtonClassName, "w-7");
const noSuggestion = () => null;
const noSubscription = () => () => {};

/**
 * A `/`-command that runs an action (e.g. `/compact`) instead of being
 * lowered into the prompt. Shown in the trigger menu; intercepted on
 * submit.
 */
export type ComposerCommandAction = AgentComposerSubmission.Command;

export type AgentComposerInputProps = {
  /** Borrow this input for an existing message; the ordinary draft is retained. */
  editing?: Readonly<{
    id: string;
    text: string;
    savedDocument?: Readonly<{ document: unknown | null }>;
    onWrite?(document: unknown | null): void;
    onCancel(): void;
  }>;
  catalog: ComposerCatalog;
  onSkillMenuOpen?: () => void;
  /** Action `/`-commands (e.g. `/compact`). Merged into the menu, ahead
   *  of the catalog's own commands, and intercepted on submit. */
  commandActions?: ComposerCommandAction[];
  /** Handle intent commands when selected, before they become prompt chips. */
  onCommandSelect?: (command: ComposerCatalog["commands"][number]) => boolean;
  /**
   * Receives the lowered prompt and the document captured at Send.
   * Empty submissions are filtered unless `allowEmptySubmit` is set.
   */
  onSubmit: (
    text: string,
    document: unknown | null,
    skills?: readonly NativeChatSkillReference[]
  ) => void | Promise<void>;
  readOnly?: boolean;
  /** Transfer the draft immediately. An undefined result uses onSubmit. */
  onCapture?: (
    text: string,
    document: unknown,
    skills?: readonly NativeChatSkillReference[]
  ) => boolean | undefined;
  /** Override the inline notice when an awaited send fails. */
  onSubmitError?: (error: unknown) => void;
  isStreaming: boolean;
  /**
   * The session's busy signal. A busy submit keeps the draft until the host
   * acknowledges it. Defaults to `isStreaming` when omitted.
   */
  busy?: boolean;
  /** An actual host-owned send awaiting acceptance, including a first-message handoff. */
  submitting?: boolean;
  /** Preserve the draft until the host acknowledges an idle submission. */
  awaitSubmission?: boolean;
  canSubmit?: boolean;
  /**
   * Stable identity for the currently bound chat session. A late queue
   * acknowledgement from an older scope must never clear an identical draft
   * in the newly selected session.
   */
  submissionScope?: string | number;
  draftRef?: Ref<
    Pick<ComposerController, "appendText" | "focus"> &
      Partial<
        Pick<
          ComposerController,
          "readDocument" | "restoreDocument" | "recordHistoryEffect"
        >
      >
  >;
  /** An Escape confirmation applies only to the turn visible on the first press. */
  activeTurnId?: string;
  onStop: () => void;
  /**
   * What the single primary button does while the draft is empty, such as
   * Pause for a running turn. Typing turns it back into Send.
   */
  emptyAction?: {
    label: string;
    icon: ReactNode;
    onClick: () => void;
    confirmWithEscape?: boolean;
  };
  /**
   * Where unsent text is kept, keyed by chat. The draft survives remounting,
   * reconnection and restarts; only deleting it or an accepted send clears it.
   */
  draft?: ComposerDraftBinding.Target & {
    store: Pick<ComposerDrafts, "beginDocumentSend" | "settleDocumentSend">;
  };
  history?: Omit<ComposerHistory.Source, "onRecallBlocked"> & {
    recallBlockedMessage?: string;
    disabled?: boolean;
    retainSent?: boolean;
    attachments?: ComposerHistory.Attachments;
  };
  placeholder?: string;
  prediction?: NativeComposerPrediction;
  /** Focus on mount and when switching to another chat's restored draft. */
  autofocus?: boolean;
  /** Send dropped or pasted items to the surface's own attachment intake. */
  onAttachmentTransfer?: (event: ComposerTransfer.Event) => void;
  /**
   * Allows an empty submit when the host gives an empty submission its own
   * action.
   */
  allowEmptySubmit?: boolean;
  /**
   * Accessible name for the submit control while the composer is empty.
   * Hosts that give an empty submission its own action should describe it here.
   */
  emptySubmitLabel?: string;
  /** Attachments the host stages itself, shown above the editor. */
  attachments?: ReactNode;
  /** A live editor selection eligible to go with the next message. */
  selectionLabel?: string;
  onClearSelection?: () => void;
  /** Footer content at the start of the toolbar. */
  toolbarStart?: ReactNode;
  /** Footer content right-aligned before the submit/stop button. */
  toolbarEnd?: ReactNode;
  voiceDictation?: ComposerVoice.Host;
  className?: string;
};

export function AgentComposerInput({
  catalog,
  commandActions,
  onCommandSelect,
  editing,
  ...rest
}: AgentComposerInputProps) {
  // Surface action commands in the `/` menu alongside catalog commands.
  const effectiveCatalog = useMemo<ComposerCatalog>(() => {
    if (editing)
      return {
        commands: [],
        mentions: catalog.mentions,
        skillMentions: undefined,
      };
    if (!commandActions || commandActions.length === 0) return catalog;
    const actionCommands = commandActions.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
    }));
    return {
      ...catalog,
      commands: [...actionCommands, ...catalog.commands],
    };
  }, [catalog, commandActions, !!editing]);

  return (
    <ComposerProvider
      catalog={effectiveCatalog}
      onCommandSelect={editing ? undefined : onCommandSelect}
    >
      <AgentComposerInner
        editing={editing}
        commandActions={commandActions}
        {...rest}
      />
    </ComposerProvider>
  );
}

function AgentComposerInner({
  editing,
  commandActions,
  onSubmit,
  onCapture,
  onSkillMenuOpen,
  onSubmitError,
  readOnly: inputReadOnly = false,
  isStreaming,
  busy,
  submitting = false,
  awaitSubmission = false,
  canSubmit = true,
  submissionScope,
  draftRef,
  activeTurnId,
  onStop,
  emptyAction,
  draft,
  history: historySource,
  prediction,
  placeholder = "Ask anything…",
  autofocus,
  onAttachmentTransfer,
  allowEmptySubmit = false,
  emptySubmitLabel,
  attachments,
  selectionLabel,
  onClearSelection,
  toolbarStart,
  toolbarEnd,
  voiceDictation,
  className,
}: Omit<AgentComposerInputProps, "catalog">) {
  const isBusy = busy ?? isStreaming;
  const composer = useComposer();
  const skillMenuOpen = composer.trigger?.kind === "skill";
  useEffect(() => {
    if (skillMenuOpen) onSkillMenuOpen?.();
  }, [skillMenuOpen, onSkillMenuOpen]);
  const openLink = useContext(BrowserOpen);
  const { readDocument, restoreDocument } = composer;
  const [editSession] = useState(() => new AgentComposerEditSession());
  // Restore this chat's unsent draft once the editor exists, then keep every
  // change. A different chat starts from its own draft.
  const draftKey = draft?.key;
  const draftStore = draft?.store;
  const promotedFrom = draft?.promotedFrom;
  const ordinaryOwner = draftKey ?? submissionScope;
  const editOwner = useMemo(() => ({}), [ordinaryOwner, draftStore]);
  const [binding] = useState(() => new ComposerDraftBinding());
  const isDraftBound = useCallback(
    () =>
      draftKey === undefined ||
      !draftStore ||
      binding.owns({ key: draftKey, store: draftStore }),
    [binding, draftKey, draftStore]
  );
  const { voice, state: voiceState } = useComposerVoice(voiceDictation);
  useLayoutEffect(
    () => voice.cancel,
    [voice, draftKey, draftStore, submissionScope, editing?.id]
  );
  useLayoutEffect(() => {
    if (
      draft &&
      binding.restore(
        draft,
        composer,
        editSession.ordinaryEditor(editOwner, composer)
      ) === "restored" &&
      autofocus &&
      !editing
    )
      composer.focus();
  }, [binding, composer, draft, autofocus, editSession, editOwner, editing]);
  useEffect(() => {
    if (!draft || !binding.owns(draft)) return;
    const current = readDocument();
    if (editing && editSession.owns(editing.id, editOwner))
      editing.onWrite?.(current);
    binding.retain(draft, editSession.document(editOwner, current));
  }, [
    binding,
    composer.snapshot,
    draft,
    readDocument,
    editSession,
    editOwner,
    editing,
  ]);
  const predictedText = useSyncExternalStore(
    prediction?.subscribe ?? noSubscription,
    prediction?.read ?? noSuggestion,
    noSuggestion
  );
  const hasEditorSelection = !!selectionLabel;
  const reportDraft = useCallback(
    (empty: boolean) => {
      if (typeof submissionScope === "number")
        prediction?.setDraft(
          submissionScope,
          empty && !editing && !hasEditorSelection && isDraftBound()
        );
    },
    [prediction, submissionScope, editing, hasEditorSelection, isDraftBound]
  );
  useEffect(() => {
    reportDraft(composer.isEmptyDraft());
  }, [reportDraft, composer]);
  useLayoutEffect(
    () => () => {
      if (typeof submissionScope === "number")
        prediction?.setDraft(submissionScope, false);
    },
    [prediction, submissionScope]
  );

  useImperativeHandle(
    draftRef,
    () => ({
      appendText: composer.appendText,
      focus: composer.focus,
      readDocument,
      restoreDocument,
      recordHistoryEffect: composer.recordHistoryEffect,
    }),
    [
      composer.appendText,
      composer.focus,
      composer.recordHistoryEffect,
      readDocument,
      restoreDocument,
    ]
  );

  const [submission] = useState(() => new AgentComposerSubmission());
  const submitScope = useMemo(
    () => ({}),
    [submissionScope, draftKey, draftStore, editing?.id]
  );
  const submitScopeRef = useRef(submitScope);
  submitScopeRef.current = submitScope;
  const pendingSubmission = useSyncExternalStore(
    submission.subscribe,
    submission.read,
    noSuggestion
  );
  const isQueueing = pendingSubmission?.scope === submitScope;
  const readOnly = inputReadOnly || (!!editing && isQueueing);
  useLayoutEffect(submission.mount, [submission]);

  // Minimal, neutral inline feedback for cases that would otherwise do nothing
  // visible, such as an unconfirmed send.
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((msg: string | null) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    if (msg) noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    []
  );
  const [localHistoryOwner] = useState(() => ({}));
  const history = ComposerHistory.forDraft(
    draftStore ?? localHistoryOwner,
    draftKey ?? String(submissionScope),
    promotedFrom
  );
  const historyScope = useMemo(
    () => (editing ? {} : history),
    [history, editing?.id]
  );
  useLayoutEffect(() => {
    const result = editSession.sync(
      editing,
      editOwner,
      { ...composer, clear: composer.clearForHistory },
      !!draft && binding.owns(draft)
    );
    if (result === "changed" || result === "rejected") notify(null);
    if (result === "rejected") editing?.onCancel();
  }, [editSession, editing, editOwner, composer, notify, draft, binding]);
  useLayoutEffect(() => {
    composer.configureHistory({
      scope: historyScope,
      history,
      active:
        !!historySource &&
        !historySource.disabled &&
        !editing &&
        !selectionLabel &&
        !voiceState.active &&
        !submitting &&
        !isQueueing &&
        isDraftBound(),
      retainSent: historySource?.retainSent,
      undoBoundary: editing && {
        undo: readOnly ? undefined : editing.onCancel,
      },
      attachments: editing ? undefined : historySource?.attachments,
      source: {
        previous: historySource?.previous ?? (() => []),
        beforeRecall: historySource?.beforeRecall,
        onRecallBlocked: () =>
          notify(historySource?.recallBlockedMessage ?? null),
      },
    });
  });

  const ownsDraft = () =>
    submitScopeRef.current === submitScope &&
    isDraftBound() &&
    (!editing || editSession.owns(editing.id, editOwner));
  const submitIntent: AgentComposerSubmission.Request = {
    scope: submitScope,
    isCurrent: ownsDraft,
    canSubmit: canSubmit && !readOnly && !submitting,
    editing: !!editing,
    busy: isBusy,
    awaitSubmission,
    allowEmpty: allowEmptySubmit,
    editor: {
      ...composer,
      clearForHistory: (sent) => {
        if (draft) binding.sent(draft);
        composer.clearForHistory(sent);
      },
      restoreDocument: (document) => {
        if (!composer.restoreDocument(document)) return false;
        if (draft) binding.retain(draft, composer.readDocument());
        return true;
      },
    },
    commands: commandActions,
    draft,
    notify,
    onCapture,
    onSubmit,
    onSubmitError,
  };

  const submitIntentRef = useRef(submitIntent);
  useLayoutEffect(() => {
    submitIntentRef.current = submitIntent;
  });
  const requestSubmit = () =>
    submission.request(() => submitIntentRef.current, voice);

  const primaryAction =
    voiceState.active || editing
      ? undefined
      : isStreaming
        ? {
            label: "Stop",
            icon: <SquareIcon className="size-3 fill-current" />,
            onClick: onStop,
            confirmWithEscape: true,
          }
        : !allowEmptySubmit && !composer.snapshot.text.trim()
          ? emptyAction
          : undefined;
  const sending = isQueueing || submitting || voiceState.sendPending;
  const actionBusy = sending || readOnly;
  const canStopDictation =
    voiceState.state.phase === "starting" ||
    voiceState.state.phase === "recording";
  const finishingDictation = voiceState.state.phase === "finishing";
  const showDictationProgress = finishingDictation && !voiceState.sendPending;
  const escapeAction =
    !sending && !voiceState.active && primaryAction?.confirmWithEscape
      ? primaryAction
      : undefined;
  const submitLabel =
    !voiceState.active &&
    allowEmptySubmit &&
    emptySubmitLabel &&
    !composer.snapshot.text.trim()
      ? emptySubmitLabel
      : "Send";
  const actionLabel = sending
    ? "Sending…"
    : (primaryAction?.label ?? submitLabel);
  const actionKey = actionBusy
    ? undefined
    : escapeAction
      ? "Escape"
      : primaryAction
        ? undefined
        : "Enter";
  const [confirmUntil, setConfirmUntil] = useState(0);
  useLayoutEffect(() => {
    setConfirmUntil(0);
  }, [editOwner, activeTurnId, escapeAction?.label]);
  useEffect(() => {
    if (!confirmUntil) return;
    const timer = setTimeout(
      () =>
        setConfirmUntil((current) => (current === confirmUntil ? 0 : current)),
      Math.max(0, confirmUntil - Date.now())
    );
    return () => clearTimeout(timer);
  }, [confirmUntil]);

  const isFormattingMenuEvent = (event: KeyboardEvent<HTMLDivElement>) =>
    event.target instanceof Element &&
    event.target.closest("[data-composer-formatting]") !== null;

  const isComposerEscape = (event: KeyboardEvent<HTMLDivElement>) =>
    !composer.trigger &&
    !isFormattingMenuEvent(event) &&
    !event.repeat &&
    !event.nativeEvent.isComposing &&
    event.nativeEvent.keyCode !== 229 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    event.currentTarget.contains(event.target as Node);

  const stopDictation = () => {
    voice.stop();
    if (voiceState.state.phase === "starting") composer.focus();
  };

  const confirmEscape = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!escapeAction || event.defaultPrevented || !isComposerEscape(event))
      return;

    event.preventDefault();
    const now = Date.now();
    if (now < confirmUntil) {
      setConfirmUntil(0);
      escapeAction.onClick();
    } else {
      setConfirmUntil(now + ESCAPE_CONFIRM_MS);
    }
  };

  return (
    <ComposerMenuAnchor
      onPointerDown={() => setConfirmUntil(0)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setConfirmUntil(0);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") confirmEscape(event);
        else if (confirmUntil) setConfirmUntil(0);
      }}
      onKeyDownCapture={(event) => {
        // The Stop tooltip may already have handled Escape to dismiss itself.
        if (
          canStopDictation &&
          event.key === "Escape" &&
          isComposerEscape(event)
        ) {
          event.preventDefault();
          event.stopPropagation();
          stopDictation();
          return;
        }
        if (
          editing &&
          !readOnly &&
          event.key === "Escape" &&
          isComposerEscape(event)
        ) {
          event.preventDefault();
          event.stopPropagation();
          editing.onCancel();
        }
      }}
      className={cn(
        "@container relative select-none rounded-xl border bg-accent transition-colors [&_button:focus-visible]:ring-1! [&_button:focus-visible]:ring-inset",
        className,
        voiceState.settings && voiceStyles.composer,
        voiceState.active && voiceState.compact && voiceStyles.compact
      )}
    >
      <ComposerTriggerMenu
        renderFileIcon={(path) => <WorkspaceFileIcon relPath={path} />}
      />
      {(attachments || selectionLabel) && (
        <ComposerAttachmentStrip>
          {attachments}
          {selectionLabel && (
            <EditorSelectionIndicator
              label={selectionLabel}
              onClear={
                onClearSelection &&
                (() => {
                  onClearSelection();
                  composer.focus();
                })
              }
            />
          )}
        </ComposerAttachmentStrip>
      )}
      <ComposerContent
        scrollFade
        onLinkClick={(event) => handleBrowserLinkClick(event, openLink)}
        onKeyDownCapture={(event) => {
          // ProseMirror prevents Escape even when there is no completion open.
          if (event.key === "Escape") confirmEscape(event);
        }}
        autofocus={autofocus}
        onSubmitRequest={requestSubmit}
        suggestion={
          !editing && prediction && predictedText
            ? { text: predictedText, take: prediction.take }
            : undefined
        }
        onDraftChange={prediction && reportDraft}
        readOnly={readOnly}
        onTransfer={onAttachmentTransfer}
        placeholder={placeholder}
        className="px-3 pt-2"
        editorClassName="min-h-9 max-h-48 overflow-y-auto select-text text-[14px] leading-[23px] font-[375] text-[color:color-mix(in_srgb,var(--foreground)_90%,var(--background))]"
      />
      {notice && (
        <p className="px-3 pb-1 text-xs text-muted-foreground">{notice}</p>
      )}
      {voiceState.notice && (
        <div role="status" className="px-3 pb-1 text-xs text-muted-foreground">
          {voiceState.notice.text}
          {voiceState.notice.settings && (
            <button
              type="button"
              className="ms-2 underline underline-offset-2"
              onClick={openVoiceSettings}
            >
              Open Voice Settings
            </button>
          )}
        </div>
      )}
      {/* Give the default ghost hover contrast against the composer surface. */}
      <div className="flex items-center gap-2 px-2 pb-2 pt-1 [--accent:color-mix(in_oklab,var(--foreground)_8%,transparent)] dark:[--accent:color-mix(in_oklab,var(--foreground)_16%,transparent)]">
        {/* Start/end tools share a shrinkable, clipping track. `ml-auto`
            creates the space-between split while the submit button stays
            outside as shrink-0, so pickers truncate before the terminal
            action is ever culled. */}
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
          {voiceState.active ? (
            <DictationActivity
              state={voiceState.state}
              cancel={() => {
                voice.cancel();
                composer.focus();
              }}
            />
          ) : (
            toolbarStart
          )}
          <div className="ml-auto flex min-w-0 items-center gap-0.5 overflow-hidden">
            {!voiceState.active && toolbarEnd}
          </div>
        </div>
        {voiceState.supported &&
          (isDesktopVoiceReady(voiceState.settings) ? (
            <DictationButton
              escapeShortcut={canStopDictation}
              label={
                showDictationProgress
                  ? "Transcribing…"
                  : voiceState.active
                    ? "Stop dictation"
                    : "Dictate"
              }
              aria-disabled={finishingDictation || undefined}
              className="aria-disabled:opacity-50"
              disabled={!voiceState.active && (actionBusy || !composer.ready)}
              onClick={(event) => {
                if (finishingDictation) return;
                if (voiceState.active) {
                  stopDictation();
                  return;
                }
                if (!ownsDraft()) return;
                const compact =
                  composer.isEmptyDraft() && !attachments && !selectionLabel;
                if (compact) event.currentTarget.focus();
                else if (event.detail > 0) composer.focus();
                void voice.start(compact, (text) => {
                  if (!ownsDraft()) return false;
                  return composer.appendText(
                    text,
                    MAX_DICTATION_DRAFT_BYTES,
                    "inline"
                  );
                });
              }}
            >
              {showDictationProgress ? (
                <LoaderCircleIcon
                  aria-hidden="true"
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
              ) : voiceState.active ? (
                <SquareIcon
                  aria-hidden="true"
                  className="size-3 fill-current"
                />
              ) : (
                <MicIcon aria-hidden="true" className="size-4" />
              )}
            </DictationButton>
          ) : (
            <DictationSetupButton
              label={
                !voiceState.settings
                  ? "Voice settings unavailable"
                  : voiceState.settings.provider
                    ? "Resume dictation in Voice settings"
                    : "Set up dictation"
              }
            />
          ))}
        <div className="shrink-0">
          <ComposerToolbarTooltip
            label={actionBusy ? undefined : primaryAction?.label}
            shortcut={escapeAction ? "Esc ×2" : undefined}
          >
            <Button
              type="button"
              size="icon-xs"
              className={cn(toolbarIconClassName, "aria-disabled:opacity-50")}
              disabled={
                (actionBusy && !voiceState.sendPending) ||
                voiceState.state.phase === "starting" ||
                (!primaryAction &&
                  (!canSubmit ||
                    (!voiceState.active &&
                      !allowEmptySubmit &&
                      !composer.snapshot.text.trim())))
              }
              aria-disabled={voiceState.sendPending || undefined}
              aria-label={actionLabel}
              aria-busy={actionBusy}
              aria-keyshortcuts={actionKey}
              onClick={() => {
                if (voiceState.sendPending) return;
                if (primaryAction) {
                  setConfirmUntil(0);
                  primaryAction.onClick();
                } else void requestSubmit();
              }}
            >
              {actionBusy ? (
                <LoaderCircleIcon
                  aria-hidden="true"
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
              ) : escapeAction && confirmUntil ? (
                <kbd
                  aria-hidden="true"
                  className="font-sans text-[10px] leading-none font-semibold"
                >
                  Esc
                </kbd>
              ) : primaryAction ? (
                primaryAction.icon
              ) : (
                <ArrowUpIcon className="size-4" />
              )}
            </Button>
          </ComposerToolbarTooltip>
          <span role="status" className="sr-only">
            {escapeAction && confirmUntil
              ? `Press Escape again to ${escapeAction.label.toLowerCase()}.`
              : ""}
          </span>
        </div>
      </div>
    </ComposerMenuAnchor>
  );
}

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
 * Lowering: the prompt is `message.meta.text` plus an explicit list of
 * any referenced file paths (from `@`-mentions / file-ref parts) so the
 * agent can resolve them even when the chip text alone is ambiguous.
 */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import type { ComposerDrafts } from "@/lib/agent-chat/composer-drafts";
import { ComposerDraftBinding } from "@/lib/agent-chat/composer-draft-binding";
import { Button } from "@app/ui/components/button";
import { cn } from "@app/ui/lib/utils";
import {
  ComposerContent,
  ComposerProvider,
  ComposerTransfer,
  ComposerTriggerMenu,
  useComposer,
  type ComposerCatalog,
  type ComposerController,
  type ComposerMessage,
} from "@/kits/composer";
import {
  AgentComposerQueueSubmitGuard,
  isSameComposerDraft,
  type AgentComposerQueueSubmitLease,
} from "./agent-composer-queue-submit";

/**
 * A `/`-command that runs an action (e.g. `/compact`) instead of being
 * lowered into the prompt. Shown in the trigger menu; intercepted on
 * submit.
 */
export type ComposerCommandAction = {
  id: string;
  title: string;
  description?: string;
  standalone?: true;
  run: () => void | Promise<void>;
};

export type AgentComposerInputProps = {
  catalog: ComposerCatalog;
  /** Action `/`-commands (e.g. `/compact`). Merged into the menu, ahead
   *  of the catalog's own commands, and intercepted on submit. */
  commandActions?: ComposerCommandAction[];
  /** Handle intent commands when selected, before they become prompt chips. */
  onCommandSelect?: (command: ComposerCatalog["commands"][number]) => boolean;
  /**
   * Receives the lowered prompt text. Empty submissions are filtered unless
   * `allowEmptySubmit` is set.
   */
  onSubmit: (text: string) => void | Promise<void>;
  isStreaming: boolean;
  /**
   * The session's busy signal. A busy submit keeps the draft until the host
   * acknowledges it. Defaults to `isStreaming` when omitted.
   */
  busy?: boolean;
  /** Preserve the draft until the host acknowledges an idle submission. */
  awaitSubmission?: boolean;
  canSubmit?: boolean;
  /**
   * Stable identity for the currently bound chat session. A late queue
   * acknowledgement from an older scope must never clear an identical draft
   * in the newly selected session.
   */
  submissionScope?: string | number;
  draftRef?: Ref<Pick<ComposerController, "appendText">>;
  onStop: () => void;
  /**
   * What the single primary button does while the draft is empty, such as
   * Stop for a running turn. Typing turns it back into Send.
   */
  emptyAction?: { label: string; icon: ReactNode; onClick: () => void };
  /**
   * Where unsent text is kept, keyed by chat. The draft survives remounting,
   * reconnection and restarts; only deleting it or an accepted send clears it.
   */
  draft?: { key: string; store: ComposerDrafts };
  placeholder?: string;
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
  /** Footer content at the start of the toolbar. */
  toolbarStart?: ReactNode;
  /** Footer content right-aligned before the submit/stop button. */
  toolbarEnd?: ReactNode;
  className?: string;
};

export function AgentComposerInput({
  catalog,
  commandActions,
  onCommandSelect,
  ...rest
}: AgentComposerInputProps) {
  // Surface action commands in the `/` menu alongside catalog commands.
  const effectiveCatalog = useMemo<ComposerCatalog>(() => {
    if (!commandActions || commandActions.length === 0) return catalog;
    const actionCommands = commandActions.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
    }));
    return {
      commands: [...actionCommands, ...catalog.commands],
      mentions: catalog.mentions,
    };
  }, [catalog, commandActions]);

  return (
    <ComposerProvider
      catalog={effectiveCatalog}
      onCommandSelect={onCommandSelect}
    >
      <AgentComposerInner commandActions={commandActions} {...rest} />
    </ComposerProvider>
  );
}

function AgentComposerInner({
  commandActions,
  onSubmit,
  isStreaming,
  busy,
  awaitSubmission = false,
  canSubmit = true,
  submissionScope,
  draftRef,
  onStop,
  emptyAction,
  draft,
  placeholder = "Ask anything…",
  autofocus,
  onAttachmentTransfer,
  allowEmptySubmit = false,
  emptySubmitLabel,
  attachments,
  toolbarStart,
  toolbarEnd,
  className,
}: Omit<AgentComposerInputProps, "catalog">) {
  const isBusy = busy ?? isStreaming;
  const composer = useComposer();
  const { readDocument, restoreDocument } = composer;
  // Restore this chat's unsent draft once the editor exists, then keep every
  // change. A different chat starts from its own draft.
  const draftKey = draft?.key;
  const draftStore = draft?.store;
  const [binding] = useState(() => new ComposerDraftBinding());
  useEffect(() => {
    if (!draftKey || !draftStore) return;
    const meeting = binding.meet(draftKey);
    if (meeting === "held") return;
    if (meeting === "renamed") {
      draftStore.write(draftKey, readDocument());
      return;
    }
    const saved = draftStore.read(draftKey);
    if (binding.held !== null) composer.clear();
    if (saved === null || restoreDocument(saved)) binding.restored(draftKey);
    // composer.clear is stable for a given editor, like restoreDocument.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding, draftKey, draftStore, readDocument, restoreDocument]);
  useEffect(() => {
    if (!draftKey || !draftStore || binding.held !== draftKey) return;
    draftStore.write(draftKey, readDocument());
  }, [binding, composer.snapshot, draftKey, draftStore, readDocument]);
  useImperativeHandle(draftRef, () => ({ appendText: composer.appendText }), [
    composer.appendText,
  ]);

  const actionById = useMemo(() => {
    const map = new Map<string, ComposerCommandAction>();
    for (const a of commandActions ?? []) map.set(a.id, a);
    return map;
  }, [commandActions]);

  const queueSubmitGuardRef = useRef<AgentComposerQueueSubmitGuard | null>(
    null
  );
  if (!queueSubmitGuardRef.current) {
    queueSubmitGuardRef.current = new AgentComposerQueueSubmitGuard();
  }
  const queueSubmitGuard = queueSubmitGuardRef.current;
  const submissionScopeRef = useRef(submissionScope);
  submissionScopeRef.current = submissionScope;
  const [queueingLease, setQueueingLease] =
    useState<AgentComposerQueueSubmitLease | null>(null);
  const isQueueing =
    queueingLease !== null &&
    queueSubmitGuard.owns(queueingLease, submissionScope);
  useEffect(() => {
    queueSubmitGuard.mount();
    return () => queueSubmitGuard.unmount();
  }, [queueSubmitGuard]);

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

  const submit = async () => {
    if (!canSubmit) return;
    if (queueSubmitGuard.inFlightFor(submissionScope)) return;
    // No `isStreaming` early-return: submitting while a turn runs queues the
    // message.
    // `allow_empty` mirrors the later `allowEmptySubmit` guard: without it the
    // composer core returns null for a blank editor and we'd bail here, before
    // that guard — so a picked-template start or host-owned empty action would
    // be lost. Let the empty message through and gate below.
    const message = composer.submit({
      submitted_at: Date.now(),
      allow_empty: allowEmptySubmit,
    });
    if (!message) return;
    // Intercept action commands (`/compact`, …) — run them instead of
    // sending a normal turn.
    const actions = message.parts
      .filter((p) => p.type === "command")
      .map((p) => (p as { id: string }).id)
      .filter((id) => actionById.has(id));
    const parts = message.parts.filter(
      (part) => part.type !== "text" || part.text.trim()
    );
    const first = parts[0];
    const literal =
      parts.length === 1 &&
      first?.type === "text" &&
      first.text.trim().startsWith("/")
        ? actionById.get(first.text.trim().slice(1))
        : undefined;
    const standalone =
      actions
        .map((id) => actionById.get(id))
        .find((action) => action?.standalone) ??
      (literal?.standalone ? literal : undefined);
    if (standalone) {
      if (parts.length !== 1) {
        notify(`Send /${standalone.id} on its own.`);
        return;
      }
      const lease = queueSubmitGuard.begin(submissionScope);
      if (!lease) return;
      setQueueingLease(lease);
      try {
        await standalone.run();
        if (queueSubmitGuard.owns(lease, submissionScopeRef.current)) {
          const current = composer.submit({
            submitted_at: message.meta.submitted_at,
            allow_empty: true,
          });
          if (current && isSameComposerDraft(message, current))
            composer.clear();
          notify(null);
        }
      } catch {
        if (queueSubmitGuard.owns(lease, submissionScopeRef.current))
          notify("Couldn't confirm the command — your draft is still here.");
      } finally {
        if (queueSubmitGuard.finish(lease)) {
          setQueueingLease((current) => (current === lease ? null : current));
        }
      }
      return;
    }
    if (actions.length > 0) {
      composer.clear();
      for (const id of actions) void actionById.get(id)!.run();
      return;
    }

    const text = lowerPrompt(message);
    if (!text.trim() && !allowEmptySubmit) return;
    if (isBusy || awaitSubmission) {
      // Busy/admission-blocked submits take the durable text queue path. Keep
      // the draft intact until enqueue is confirmed; otherwise a transient
      // bridge failure would clear the only copy of the user's text. The guard also prevents Enter/button double-enqueues while
      // that acknowledgement is in flight.
      const lease = queueSubmitGuard.begin(submissionScope);
      if (!lease) return;
      setQueueingLease(lease);
      // The chat this draft belongs to can change while the send is confirmed,
      // e.g. when a new chat is created. Clear exactly the draft that was sent.
      const sentDraft = draftKey && {
        key: draftKey,
        doc: JSON.stringify(readDocument()),
      };
      if (sentDraft) binding.send(sentDraft.key);
      try {
        await onSubmit(text);
        // A new chat's draft is kept under the id it was assigned meanwhile.
        if (sentDraft && draftStore)
          for (const key of binding.settle(sentDraft.key))
            if (JSON.stringify(draftStore.read(key)) === sentDraft.doc)
              draftStore.write(key, null);
        if (queueSubmitGuard.owns(lease, submissionScopeRef.current)) {
          // The editor remains usable while the bridge acknowledges enqueue.
          // Re-read it now: a user edit or session switch may have produced a
          // newer draft that this older acknowledgement must never clear.
          const currentMessage = composer.submit({
            submitted_at: message.meta.submitted_at,
            allow_empty: true,
          });
          if (currentMessage && isSameComposerDraft(message, currentMessage))
            composer.clear();
          notify(null);
        }
      } catch {
        if (queueSubmitGuard.owns(lease, submissionScopeRef.current)) {
          notify(
            awaitSubmission
              ? "Couldn't confirm the send — your draft is still here."
              : "Couldn't queue the message — your draft is still here."
          );
        }
      } finally {
        if (sentDraft) binding.settle(sentDraft.key);
        if (queueSubmitGuard.finish(lease)) {
          setQueueingLease((current) => (current === lease ? null : current));
        }
      }
      return;
    }

    composer.clear();
    notify(null);
    void onSubmit(text);
  };

  return (
    <div
      className={cn(
        "relative rounded-lg border bg-accent transition-colors [&_button:focus-visible]:ring-1! [&_button:focus-visible]:ring-inset",
        className
      )}
    >
      <ComposerTriggerMenu />
      {attachments && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2">
          {attachments}
        </div>
      )}
      <ComposerContent
        autofocus={autofocus}
        onSubmitRequest={submit}
        onTransfer={onAttachmentTransfer}
        placeholder={placeholder}
        className="px-3 pt-2"
        editorClassName="min-h-9 max-h-48 overflow-y-auto text-[15px] leading-6"
      />
      {notice && (
        <p className="px-3 pb-1 text-xs text-muted-foreground">{notice}</p>
      )}
      <div className="flex items-center gap-1 px-2 pb-2 pt-1">
        {/* Start/end tools share a shrinkable, clipping track. `ml-auto`
            creates the space-between split while the submit button stays
            outside as shrink-0, so pickers truncate before the terminal
            action is ever culled. */}
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
          {toolbarStart}
          <div className="ml-auto flex min-w-0 items-center gap-0.5 overflow-hidden">
            {toolbarEnd}
          </div>
        </div>
        <div className="shrink-0">
          {emptyAction && !isStreaming && !composer.snapshot.text.trim() ? (
            <Button
              type="button"
              size="icon-xs"
              className="size-7 rounded-full"
              onClick={emptyAction.onClick}
              aria-label={emptyAction.label}
            >
              {emptyAction.icon}
            </Button>
          ) : isStreaming ? (
            <Button
              type="button"
              size="icon-xs"
              className="size-7 rounded-full"
              onClick={onStop}
              aria-label="Stop"
            >
              <SquareIcon className="size-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon-xs"
              className="size-7 rounded-full"
              onClick={submit}
              disabled={!canSubmit || isQueueing}
              aria-label={
                allowEmptySubmit &&
                emptySubmitLabel &&
                !composer.snapshot.text.trim()
                  ? emptySubmitLabel
                  : "Send"
              }
            >
              <ArrowUpIcon className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Build the prompt text the agent receives: the composer's plain text, then
 * any referenced workspace paths (`@`-mentions / file-refs) as an explicit
 * list so the agent can resolve them.
 */
function lowerPrompt(message: ComposerMessage): string {
  const paths = new Set<string>();
  for (const part of message.parts) {
    if (part.type === "mention" && part.target.path)
      paths.add(part.target.path);
    else if (part.type === "file-ref") paths.add(part.ref.path);
  }
  const sections = [message.meta.text.trim()];
  if (paths.size > 0)
    sections.push(
      `Referenced workspace files:\n${[...paths]
        .map((path) => `- ${path}`)
        .join("\n")}`
    );
  return sections.filter((s) => s.length > 0).join("\n\n");
}

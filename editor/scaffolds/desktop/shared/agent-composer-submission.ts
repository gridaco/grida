import type {
  ComposerCore,
  ComposerMessage,
} from "@/kits/composer/composer-core";
import type { NativeChatSkillReference } from "@grida/desktop-bridge";
import { SkillMentions } from "@/lib/agent-chat/skill-mentions";
import type { ComposerHistory } from "@/kits/composer/composer-history";
import type { ComposerDrafts } from "@/lib/agent-chat/composer-drafts";
import {
  AgentComposerQueueSubmitGuard,
  isSameComposerDraft,
} from "./agent-composer-queue-submit";

/** Delivers one composer intent and settles only the draft that issued it. */
export class AgentComposerSubmission {
  private readonly guard = new AgentComposerQueueSubmitGuard();
  readonly mount = this.guard.mount;
  readonly read = this.guard.read;
  readonly subscribe = this.guard.subscribe;

  request(
    readRequest: () => AgentComposerSubmission.Request,
    voice: AgentComposerSubmission.Voice
  ): void | Promise<void> {
    const request = readRequest();
    const { active, sendPending } = voice.getSnapshot();
    if (!active) return this.submit(request);
    if (
      sendPending ||
      !request.canSubmit ||
      !request.isCurrent() ||
      this.guard.inFlightFor(request.scope)
    )
      return;
    voice.stopAndSend(() => {
      const current = readRequest();
      if (current.scope === request.scope) void this.submit(current);
    });
  }

  async submit(request: AgentComposerSubmission.Request): Promise<void> {
    const {
      editor,
      scope,
      editing,
      draft,
      allowEmpty,
      notify,
      onCapture,
      onSubmit,
      onSubmitError,
    } = request;
    if (
      !request.canSubmit ||
      !request.isCurrent() ||
      this.guard.inFlightFor(scope)
    )
      return;

    const message = editor.submit({
      submitted_at: Date.now(),
      allow_empty: allowEmpty,
    });
    if (!message) return;
    const command = editing ? undefined : this.runCommand(request, message);
    if (command) return command;
    let skills: readonly NativeChatSkillReference[] | undefined;
    try {
      skills = SkillMentions.selected(message, editing);
      if (editing && skills?.length)
        throw new Error("Send skill selections in a new message.");
    } catch (error) {
      if (onSubmitError) onSubmitError(error);
      else
        notify(
          error instanceof Error
            ? error.message
            : "A selected skill is unavailable."
        );
      return;
    }
    const text = lowerPrompt(message, editing);
    if (!text.trim() && !allowEmpty && !skills?.length) return;

    const document = editor.readDocument();
    const selected = skills ? ([skills] as const) : ([] as const);
    const historyDraft = editing ? undefined : editor.readHistoryDraft();
    const sameDocument = editing ? undefined : editor.guardHistoryDocument();
    const clearSent = () =>
      editor.clearForHistory(
        historyDraft && {
          draft: historyDraft,
          text: message.meta.markdown ?? message.meta.text,
        }
      );
    const reportError = (error: unknown, fallback: string) => {
      if (onSubmitError) onSubmitError(error);
      else notify(SkillMentions.refusal(error) ?? fallback);
    };
    if (!editing && onCapture) {
      try {
        const captured = onCapture(text, document, ...selected);
        if (captured !== undefined) {
          if (captured) {
            clearSent();
            editor.focus();
            notify(null);
          }
          return;
        }
      } catch (error) {
        reportError(
          error,
          "Couldn't send the message. Your draft is still here."
        );
        return;
      }
    }
    if (editing || draft || request.busy || request.awaitSubmission) {
      const lease = this.guard.begin(scope);
      if (!lease) return;
      let sentDraft:
        | ReturnType<ComposerDrafts["beginDocumentSend"]>
        | undefined;
      try {
        if (!editing && draft)
          sentDraft = draft.store.beginDocumentSend(draft.key, document);
        await onSubmit(text, document, ...selected);
        if (editing) return;
        const current =
          this.guard.owns(lease) &&
          request.isCurrent() &&
          sameDocument?.() === true &&
          this.matches(editor, message);
        const settled =
          !sentDraft || draft?.store.settleDocumentSend(sentDraft, true);
        sentDraft = undefined;
        if (current && settled) {
          clearSent();
          notify(null);
        }
      } catch (error) {
        if (this.guard.owns(lease) && request.isCurrent())
          reportError(
            error,
            editing
              ? "Couldn't save changes. Your edit is still here."
              : request.awaitSubmission
                ? "Couldn't confirm the send — your draft is still here."
                : "Couldn't queue the message — your draft is still here."
          );
      } finally {
        if (sentDraft) draft?.store.settleDocumentSend(sentDraft, false);
        this.guard.finish(lease);
      }
      return;
    }

    clearSent();
    notify(null);
    void onSubmit(text, document, ...selected);
  }

  private matches(
    editor: AgentComposerSubmission.Request["editor"],
    message: ComposerMessage
  ): boolean {
    const current = editor.submit({
      submitted_at: message.meta.submitted_at,
      allow_empty: true,
    });
    return current !== null && isSameComposerDraft(message, current);
  }

  private runCommand(
    request: AgentComposerSubmission.Request,
    message: ComposerMessage
  ): Promise<void> | undefined {
    if (!request.commands?.length) return;
    const actionById = new Map(
      request.commands.map((action) => [action.id, action])
    );
    const parts = message.parts.filter(
      (part) => part.type !== "text" || part.text.trim()
    );
    const actions = parts.flatMap((part) => {
      const action =
        part.type === "command" ? actionById.get(part.id) : undefined;
      return action ? [action] : [];
    });
    const first = parts[0];
    const literal =
      parts.length === 1 &&
      first?.type === "text" &&
      first.text.trim().startsWith("/")
        ? actionById.get(first.text.trim().slice(1))
        : undefined;
    const standalone =
      actions.find((action) => action.standalone) ??
      (literal?.standalone ? literal : undefined);
    if (standalone) {
      if (parts.length !== 1) {
        request.notify(`Send /${standalone.id} on its own.`);
        return Promise.resolve();
      }
      return standalone.dispatch
        ? this.dispatchStandalone(request, standalone.dispatch)
        : this.runStandalone(request, message, standalone);
    }
    if (!actions.length) return;
    request.editor.clear();
    for (const action of actions) void action.run();
    return Promise.resolve();
  }

  private async dispatchStandalone(
    {
      scope,
      editor,
      draft,
      isCurrent,
      notify,
    }: AgentComposerSubmission.Request,
    dispatch: NonNullable<AgentComposerSubmission.Command["dispatch"]>
  ): Promise<void> {
    const lease = this.guard.begin(scope);
    if (!lease) return;
    const current = () => this.guard.owns(lease) && isCurrent();
    const document = editor.readDocument();
    try {
      const admission = dispatch();
      if (!admission) return;
      if (draft) {
        const sent = draft.store.beginDocumentSend(draft.key, document);
        draft.store.settleDocumentSend(sent, true);
      }
      editor.clearForHistory();
      editor.focus();
      const untouched = editor.guardHistoryDocument();
      const attachment = editor.readHistoryDraft()?.attachment;
      notify(null);
      if (
        (await admission) === "refused" &&
        current() &&
        untouched() &&
        editor.readHistoryDraft()?.attachment === attachment &&
        document !== null
      )
        editor.restoreDocument(document);
    } catch {
      if (current()) notify("Couldn't confirm the command.");
    } finally {
      this.guard.finish(lease);
    }
  }

  private async runStandalone(
    { scope, editor, isCurrent, notify }: AgentComposerSubmission.Request,
    message: ComposerMessage,
    action: AgentComposerSubmission.Command
  ): Promise<void> {
    const lease = this.guard.begin(scope);
    if (!lease) return;
    const unchanged = editor.guardHistoryDocument();
    try {
      await action.run();
      if (this.guard.owns(lease) && isCurrent()) {
        if (unchanged() && this.matches(editor, message)) editor.clear();
        notify(null);
      }
    } catch {
      if (this.guard.owns(lease) && isCurrent())
        notify("Couldn't confirm the command — your draft is still here.");
    } finally {
      this.guard.finish(lease);
    }
  }
}

export namespace AgentComposerSubmission {
  export type Command = {
    id: string;
    title: string;
    description?: string;
    standalone?: true;
    run: () => void | Promise<void>;
    /** Return undefined if local eligibility checks refuse to dispatch. */
    dispatch?: () =>
      | Promise<"accepted" | "refused" | "unconfirmed">
      | undefined;
  };

  export type Voice = Readonly<{
    getSnapshot(): { active: boolean; sendPending: boolean };
    stopAndSend(send: () => void): void;
  }>;

  export type Request = {
    scope: object;
    isCurrent(): boolean;
    canSubmit: boolean;
    editing: boolean;
    busy: boolean;
    awaitSubmission: boolean;
    allowEmpty: boolean;
    commands?: readonly Command[];
    editor: Editor;
    draft?: {
      key: string;
      store: Pick<ComposerDrafts, "beginDocumentSend" | "settleDocumentSend">;
    };
    onCapture?: (
      text: string,
      document: unknown,
      skills?: readonly NativeChatSkillReference[]
    ) => boolean | undefined;
    onSubmit(
      text: string,
      document: unknown | null,
      skills?: readonly NativeChatSkillReference[]
    ): void | Promise<void>;
    onSubmitError?(error: unknown): void;
    notify(message: string | null): void;
  };

  export type Editor = Readonly<{
    submit(
      input: Parameters<ComposerCore["createMessage"]>[0]
    ): ComposerMessage | null;
    readDocument(): unknown | null;
    restoreDocument(document: unknown): boolean;
    readHistoryDraft(): ComposerHistory.Draft | undefined;
    guardHistoryDocument(): () => boolean;
    clear(): void;
    clearForHistory(sent?: {
      draft: ComposerHistory.Draft;
      text: string;
    }): void;
    focus(): boolean;
  }>;
}

/**
 * Build the prompt text the agent receives: the authored message, then
 * any referenced workspace paths (`@`-mentions / file-refs) as an explicit
 * list so the agent can resolve them.
 */
function lowerPrompt(
  message: ComposerMessage,
  preserveWhitespace = false
): string {
  const paths = new Set<string>();
  for (const part of message.parts) {
    if (part.type === "mention" && part.target.path)
      paths.add(part.target.path);
    else if (part.type === "file-ref") paths.add(part.ref.path);
  }
  const text = message.meta.markdown ?? message.meta.text;
  const sections = [preserveWhitespace ? text : text.trim()];
  if (paths.size > 0)
    sections.push(
      `Referenced workspace files:\n${[...paths]
        .map((path) => `- ${path}`)
        .join("\n")}`
    );
  return sections.filter((s) => s.length > 0).join("\n\n");
}

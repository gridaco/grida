"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@app/ui/components/button";
import { Textarea } from "@app/ui/components/textarea";
import type { NativeSideChatController } from "@/lib/agent-chat/native-side-chat-controller";

const OUTCOME = {
  succeeded: "",
  failed: "The side question failed.",
  cancelled: "The side question was cancelled.",
  uncertain: "The side question's outcome is uncertain.",
} as const;

export function NativeSideChatPanel({
  controller,
  close,
  addToDraft,
  draftUnavailable,
}: {
  controller: NativeSideChatController;
  close: () => void;
  addToDraft: (turnId: string) => void;
  draftUnavailable: boolean;
}) {
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  return (
    <section
      aria-label="Side chat"
      data-testid="workspace-side-chat"
      className="flex max-h-[38vh] min-h-0 shrink-0 flex-col gap-2 overflow-y-auto border-y bg-muted/20 px-3 py-2 text-xs"
    >
      <div className="flex shrink-0 items-center gap-2">
        <strong>Side chat</strong>
        <span className="flex-1 text-muted-foreground">
          Temporary · Read-only
        </span>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={view.phase === "closing"}
          onClick={close}
        >
          Close side chat
        </Button>
      </div>
      {view.context && (
        <p className="text-muted-foreground">
          {view.context.compacted
            ? "Uses the parent summary and committed text."
            : "Uses committed text from the parent chat."}
          {(view.context.truncated || view.context.omitted) &&
            " Some context was omitted."}
        </p>
      )}
      {view.phase === "opening" && <p role="status">Opening side chat…</p>}
      {view.phase === "closing" && <p role="status">Closing side chat…</p>}
      {view.error && (
        <p role="alert" className="text-destructive">
          {view.error}
        </p>
      )}
      {view.phase === "unavailable" && (
        <Button
          className="self-start"
          type="button"
          size="xs"
          variant="outline"
          onClick={() => void controller.open()}
        >
          Retry side chat
        </Button>
      )}
      {view.exchanges.length > 0 && (
        <ol className="space-y-2">
          {view.exchanges.map(({ question, answer }) => (
            <li key={answer.turnId} className="space-y-1 break-words">
              <p className="whitespace-pre-wrap font-medium">{question}</p>
              {answer.text && (
                <p className="whitespace-pre-wrap">{answer.text}</p>
              )}
              {OUTCOME[answer.status] && (
                <p role="status">{OUTCOME[answer.status]}</p>
              )}
              {answer.textTruncated && (
                <p className="text-muted-foreground">
                  The answer was shortened.
                </p>
              )}
              {answer.status === "succeeded" && answer.text.trim() && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={draftUnavailable}
                  onClick={() => addToDraft(answer.turnId)}
                >
                  Add to parent draft
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
      {view.phase === "ready" && (
        <form
          className="flex shrink-0 items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void controller.ask();
          }}
        >
          <Textarea
            aria-label="Side chat question"
            placeholder="Ask about the parent chat…"
            rows={2}
            value={view.draft}
            disabled={view.asking}
            onChange={(event) => controller.setDraft(event.currentTarget.value)}
          />
          <Button
            type="submit"
            size="xs"
            disabled={view.asking || !view.draft.trim()}
          >
            {view.asking ? "Asking…" : "Ask"}
          </Button>
        </form>
      )}
    </section>
  );
}

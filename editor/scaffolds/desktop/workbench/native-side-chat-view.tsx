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

/**
 * One side chat's conversation and actions. It fills the container it is
 * placed in and carries no placement chrome; where it shows is decided by a
 * `SideChatPlacement` (see `side-chat-placement.ts`). `close` ends the side
 * chat like any other action.
 */
export function NativeSideChatView({
  side,
  close,
}: {
  side: NativeSideChatController;
  close: () => void;
}) {
  const view = useSyncExternalStore(side.subscribe, side.read, side.read);
  return (
    <section
      aria-label="Side chat"
      data-testid="native-side-chat"
      className="flex h-full min-h-0 w-full flex-col text-xs"
    >
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
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
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-2">
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
            onClick={() => void side.open()}
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
              </li>
            ))}
          </ol>
        )}
      </div>
      {view.phase === "ready" && (
        <form
          className="flex shrink-0 items-end gap-2 px-3 pb-3"
          onSubmit={(event) => {
            event.preventDefault();
            void side.ask();
          }}
        >
          <Textarea
            aria-label="Side chat question"
            placeholder="Ask about the parent chat…"
            rows={2}
            value={view.draft}
            disabled={view.asking}
            onChange={(event) => side.setDraft(event.currentTarget.value)}
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

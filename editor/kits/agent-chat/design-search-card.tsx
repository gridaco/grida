/**
 * `design_search` pick UI — the artwork-station gather+curate step.
 *
 * Mental model: the agent proposes an initial search; this is a SESSION-GLOBAL
 * prompt the host pins above its composer (like the `question` card). The run is
 * paused on the human: {@link findPendingDesignSearch} finds the open call, the
 * surface mounts {@link DesignSearchPickCard}, and the user may refine the
 * app-side Library search and select across multiple searches. The picked
 * references leave through `onPick` → `chat.addToolResult({ tool:
 * "design_search", toolCallId, output })`, and the paused run resumes
 * conditioned on the picks.
 *
 * Library pins are URLs — nothing is downloaded here; a pick carries its image
 * url straight through to image-to-image.
 */

"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { cn } from "@app/ui/lib/utils";
import { Button } from "@app/ui/components/button";
import { Input } from "@app/ui/components/input";
import { CheckIcon, Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import { AgentDesignSearch } from "@grida/agent/tools/design-search";
import type { ChatMessage, ToolCallEntry } from "@/lib/agent-chat";
import { DesignSearchExplorer } from "./design-search-explorer";

type Pin = AgentDesignSearch.DesignSearchResult;
type Output = AgentDesignSearch.DesignSearchOutput;

export type PickReferencesHandler = (
  toolCallId: string,
  output: Output
) => void;

/** Run the library search for a query and return the result pins (app-side). */
export type FetchReferences = (query: string) => Promise<Pin[]>;

const PART_TYPE = `tool-${AgentDesignSearch.TOOL_NAME}`;

function toolCallIdOf(entry: ToolCallEntry): string {
  const e = entry as { toolCallId?: string; tool_call_id?: string };
  return e.toolCallId ?? e.tool_call_id ?? "";
}

function queryOf(entry: ToolCallEntry): string {
  return AgentDesignSearch.initialSearchQuery(
    "input" in entry ? entry.input : undefined
  );
}

/**
 * The session's ONE open design_search (paused on the user), or null. Mirrors
 * `findPendingQuestion` — it lives on the last assistant message at
 * `input-available`. Tolerates live (camelCase) and rehydrated (snake_case) parts.
 */
export function findPendingDesignSearch(
  messages: ChatMessage[]
): ToolCallEntry | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return null;
  for (const part of last.parts) {
    const p = part as {
      type?: string;
      state?: string;
      toolCallId?: string;
      tool_call_id?: string;
    };
    const toolCallId = p.toolCallId ?? p.tool_call_id;
    if (p.type === PART_TYPE && p.state === "input-available" && toolCallId) {
      return part as ToolCallEntry;
    }
  }
  return null;
}

/**
 * The interactive pick form. Fetches results for the call's query, shows a
 * selectable gallery, and commits the picks (or a skip) via `onPick`.
 */
export function DesignSearchPickCard({
  entry,
  onPick,
  fetchResults,
  disabled,
}: {
  entry: ToolCallEntry;
  onPick: PickReferencesHandler;
  fetchResults: FetchReferences;
  disabled?: boolean;
}) {
  const toolCallId = toolCallIdOf(entry);
  return (
    <DesignSearchPickForm
      key={toolCallId}
      toolCallId={toolCallId}
      initialQuery={queryOf(entry)}
      onPick={onPick}
      fetchResults={fetchResults}
      disabled={disabled}
    />
  );
}

function DesignSearchPickForm({
  toolCallId,
  initialQuery,
  onPick,
  fetchResults,
  disabled,
}: {
  toolCallId: string;
  initialQuery: string;
  onPick: PickReferencesHandler;
  fetchResults: FetchReferences;
  disabled?: boolean;
}) {
  const [draftQuery, setDraftQuery] = useState(initialQuery);
  const [explorer, setExplorer] = useState(() =>
    DesignSearchExplorer.create(initialQuery)
  );
  const explorerRef = useRef(explorer);
  const [results, setResults] = useState<Pin[] | null>(null);
  const [error, setError] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Fetch once for the initial query and again for each committed refinement.
  useEffect(() => {
    const ticket = explorer.ticket();
    const fresh = () => explorerRef.current.accepts(ticket);
    setResults(null);
    setError(false);
    void fetchResults(ticket.query)
      .then((pins) => {
        if (fresh()) setResults(pins);
      })
      .catch(() => {
        if (fresh()) setError(true);
      });
  }, [explorer.query, explorer.revision, fetchResults]);

  function toggle(pin: Pin) {
    if (busy) return;
    const next = explorerRef.current.toggle(pin);
    explorerRef.current = next;
    setExplorer(next);
  }

  function removeSelected(id: string) {
    if (busy) return;
    const next = explorerRef.current.remove(id);
    explorerRef.current = next;
    setExplorer(next);
  }

  function submit(output: Output) {
    if (submitted) return;
    setSubmitted(true);
    onPick(toolCallId, output);
  }

  const busy = disabled || submitted;

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const current = explorerRef.current;
    const next = current.refine(draftQuery);
    setDraftQuery(next.query);
    if (next === current) return;
    explorerRef.current = next;
    setExplorer(next);
    setResults(null);
    setError(false);
  }

  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
      <form onSubmit={search} className="mb-2 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search the Library"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="Search the Library"
            disabled={busy}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={
            busy || !draftQuery.trim() || draftQuery.trim() === explorer.query
          }
        >
          Search
        </Button>
      </form>

      {explorer.selectedCount > 0 && (
        <div className="mb-2 flex items-center gap-2">
          <span className="shrink-0 text-xs text-muted-foreground">
            {explorer.selectedCount} selected
          </span>
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {explorer.selectedPins.map((pin) => (
              <button
                key={pin.id}
                type="button"
                disabled={busy}
                onClick={() => removeSelected(pin.id)}
                aria-label={`Remove ${pin.title}`}
                title={`Remove ${pin.title}`}
                className="group relative size-8 shrink-0 overflow-hidden rounded border border-border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pin.url}
                  alt=""
                  draggable={false}
                  className="size-full select-none object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/45 group-hover:opacity-100">
                  <XIcon className="size-3" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {results === null && !error && (
        <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2Icon className="size-3.5 animate-spin" />
          <span>Searching the library…</span>
        </div>
      )}

      {error && (
        <p className="py-4 text-xs text-muted-foreground">
          The library search failed.
        </p>
      )}

      {results && results.length === 0 && (
        <p className="py-4 text-xs text-muted-foreground">
          No matching references. Try another search.
        </p>
      )}

      {results && results.length > 0 && (
        <div className="grid max-h-72 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
          {results.map((pin) => {
            const on = explorer.isSelected(pin.id);
            return (
              <button
                key={pin.id}
                type="button"
                disabled={busy}
                aria-pressed={on}
                onClick={() => toggle(pin)}
                title={pin.title}
                className={cn(
                  "relative aspect-square overflow-hidden rounded-md border-2 transition",
                  on
                    ? "border-primary"
                    : "border-transparent hover:border-border"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pin.url}
                  alt={pin.title}
                  loading="lazy"
                  className="size-full object-cover"
                />
                {on && (
                  <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <CheckIcon className="size-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => submit({ picked: [], skipped: true })}
        >
          Skip
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || explorer.selectedCount === 0}
          onClick={() => submit({ picked: explorer.selectedPins })}
        >
          Use {explorer.selectedCount > 0 ? explorer.selectedCount : ""}{" "}
          reference
          {explorer.selectedCount === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}

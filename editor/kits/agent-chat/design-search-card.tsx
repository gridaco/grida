/**
 * `design_search` pick UI — the artwork-station gather+curate step.
 *
 * Mental model: the agent proposes a keyword; this is a SESSION-GLOBAL prompt the
 * host pins above its composer (like the `question` card). The run is paused on
 * the human: {@link findPendingDesignSearch} finds the open call, the surface
 * mounts {@link DesignSearchPickCard}, which runs the library search (via the
 * `fetchResults` the surface injects — the library client is app-side), shows the
 * results, and lets the user MULTI-SELECT. The picked references leave through
 * `onPick` → `chat.addToolResult({ tool: "design_search", toolCallId, output })`,
 * and the paused run resumes conditioned on the picks.
 *
 * Library pins are URLs — nothing is downloaded here; a pick carries its image
 * url straight through to image-to-image.
 */

"use client";

import { useEffect, useState } from "react";
import { cn } from "@app/ui/lib/utils";
import { Button } from "@app/ui/components/button";
import { Loader2Icon, CheckIcon } from "lucide-react";
import { AgentDesignSearch } from "@grida/agent/tools/design-search";
import type { ChatMessage, ToolCallEntry } from "@/lib/agent-chat";

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
  const input = ("input" in entry ? entry.input : undefined) as
    | { query?: unknown }
    | undefined;
  return typeof input?.query === "string" ? input.query : "";
}

/** The pins to return, in result order, for the selected ids. Pure + testable. */
export function selectedPins(results: Pin[], ids: ReadonlySet<string>): Pin[] {
  return results.filter((r) => ids.has(r.id));
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
  const query = queryOf(entry);
  const [results, setResults] = useState<Pin[] | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  // Fetch once per pending call. A new call (new toolCallId) reruns it.
  useEffect(() => {
    let live = true;
    setResults(null);
    setError(false);
    setSelected(new Set());
    setSubmitted(false);
    fetchResults(query)
      .then((pins) => {
        if (live) setResults(pins);
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [toolCallId, query, fetchResults]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit(output: Output) {
    if (submitted) return;
    setSubmitted(true);
    onPick(toolCallId, output);
  }

  const busy = disabled || submitted;

  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Pick references{query ? ` for “${query}”` : ""}
        </p>
        {selected.size > 0 && (
          <span className="text-xs text-muted-foreground">
            {selected.size} selected
          </span>
        )}
      </div>

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
          No matching references. Skip, or ask for a different look.
        </p>
      )}

      {results && results.length > 0 && (
        <div className="grid max-h-72 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
          {results.map((pin) => {
            const on = selected.has(pin.id);
            return (
              <button
                key={pin.id}
                type="button"
                disabled={busy}
                aria-pressed={on}
                onClick={() => toggle(pin.id)}
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
          disabled={busy || selected.size === 0}
          onClick={() =>
            submit({ picked: selectedPins(results ?? [], selected) })
          }
        >
          Use {selected.size > 0 ? selected.size : ""} reference
          {selected.size === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}

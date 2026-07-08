/**
 * Transcript record for `design_search` (the gather+curate step). The live pick
 * interaction is a session-global card pinned above the composer
 * (`design-search-card.tsx`); here we render only the PASSIVE record: while
 * pending, a "gathering" line; once answered, the references the user picked as
 * thumbnails. Library pins are URLs, so thumbnails render straight from `url`.
 */

import { getToolName } from "ai";
import { Loader2Icon } from "lucide-react";
import { AgentDesignSearch } from "@grida/agent/tools/design-search";
import type { ToolCallEntry } from "@/lib/agent-chat";
import { FullscreenImagePreview } from "./tool-media";

export function isDesignSearchEntry(entry: ToolCallEntry): boolean {
  return getToolName(entry) === AgentDesignSearch.TOOL_NAME;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

type Pin = AgentDesignSearch.DesignSearchResult;

function pickedPins(entry: ToolCallEntry): Pin[] {
  const out = asRecord("output" in entry ? entry.output : undefined);
  if (!Array.isArray(out.picked)) return [];
  return (out.picked as unknown[])
    .map((r) => asRecord(r))
    .filter((r) => str(r.id) && str(r.url))
    .map((r) => ({
      id: r.id as string,
      title: str(r.title) ?? "Untitled",
      url: r.url as string,
    }));
}

export function DesignSearchContent({ entry }: { entry: ToolCallEntry }) {
  const query = str(asRecord("input" in entry ? entry.input : undefined).query);

  // Pending — the pick card above the composer is handling it.
  if (entry.state === "input-streaming" || entry.state === "input-available") {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" />
        <span>
          Gathering references{query ? ` for “${query}”` : ""} — pick above.
        </span>
      </div>
    );
  }

  // A real failure (e.g. the headless-host refusal) must read as an error, not
  // be collapsed into the "no references picked" skip message below.
  if (entry.errorText) {
    return (
      <p className="py-2 text-xs text-destructive">{String(entry.errorText)}</p>
    );
  }

  const picked = pickedPins(entry);
  if (picked.length === 0) {
    return (
      <p className="py-2 text-xs text-muted-foreground">
        No references picked{query ? ` for “${query}”` : ""}.
      </p>
    );
  }

  return (
    <div className="py-1">
      <p className="mb-1.5 text-xs text-muted-foreground">
        Picked {picked.length} reference{picked.length === 1 ? "" : "s"}
        {query ? ` for “${query}”` : ""}
      </p>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
        {picked.map((pin) => (
          <FullscreenImagePreview
            key={pin.id}
            src={pin.url}
            alt={pin.title}
            title={pin.title}
            className="block w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pin.url}
              alt={pin.title}
              loading="lazy"
              className="aspect-square w-full rounded-md border border-border object-cover"
            />
          </FullscreenImagePreview>
        ))}
      </div>
    </div>
  );
}

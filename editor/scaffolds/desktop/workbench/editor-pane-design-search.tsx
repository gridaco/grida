/**
 * The dedicated editor-pane Library picker.
 *
 * The agent supplies an initial query; the user may refine it, explore nested
 * similar references, and retain selections across searches. The scoped
 * Library explorer owns its own memory history, while the pending tool session
 * remains responsible only for committing or skipping the final selection.
 *
 * Manual regression:
 * `test/desktop-agent-chat-library-search-refinement.md`.
 */

"use client";

import { type FormEvent, useCallback, useMemo, useRef, useState } from "react";
import { ArrowRightIcon, SearchIcon, XIcon } from "lucide-react";
import type { AgentDesignSearch } from "@grida/agent/tools/design-search";
import { Button } from "@app/ui/components/button";
import { Input } from "@app/ui/components/input";
import { DesignSearchExplorer } from "@/kits/agent-chat";
import {
  LibraryExplorerView,
  type LibraryExplorerItem,
  type LibraryExplorerViewHandle,
} from "@/kits/library-explorer";
import { resolveLibraryExplorerPage } from "@/scaffolds/desktop/shared/design-search";
import {
  pickQuery,
  pickToolCallId,
  type DesignSearchSession,
} from "./design-search-tab";

type Pin = AgentDesignSearch.DesignSearchResult;

function SelectionBar({
  pins,
  disabled,
  onRemove,
  onUse,
  onNavigate,
}: {
  pins: Pin[];
  disabled: boolean;
  onRemove: (id: string) => void;
  onUse: () => void;
  onNavigate: (pin: Pin) => void;
}) {
  if (pins.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="pointer-events-auto flex min-w-64 max-w-[min(30rem,100%)] items-center gap-2 rounded-xl border border-background/10 bg-foreground/95 p-1.5 shadow-lg backdrop-blur">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5 overflow-visible">
          {pins.map((pin) => (
            <div
              key={pin.id}
              className="group relative size-11 shrink-0 rounded-md border border-background/15"
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onNavigate(pin)}
                aria-label={`Show ${pin.title}`}
                className="block size-full cursor-pointer overflow-hidden rounded-[inherit] disabled:cursor-default"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pin.url}
                  alt=""
                  draggable={false}
                  className="size-full select-none object-cover"
                />
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemove(pin.id)}
                aria-label={`Remove ${pin.title}`}
                className="pointer-events-none absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-background text-foreground opacity-0 shadow ring-1 ring-foreground/10 transition hover:scale-105 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 disabled:opacity-50"
              >
                <XIcon className="size-2.5" />
              </button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="xs"
          disabled={disabled}
          onClick={onUse}
          aria-label={`Use ${pins.length} reference${pins.length === 1 ? "" : "s"}`}
          className="mx-4 h-8 shrink-0 rounded-full px-4 py-2 has-[>svg]:px-4"
        >
          Use
          <ArrowRightIcon />
        </Button>
      </div>
    </div>
  );
}

export function EditorPaneDesignSearch({
  session,
}: {
  session: DesignSearchSession;
}) {
  const toolCallId = pickToolCallId(session.entry);
  return (
    <DesignSearchPicker
      key={toolCallId}
      session={session}
      toolCallId={toolCallId}
      initialQuery={pickQuery(session.entry)}
    />
  );
}

function DesignSearchPicker({
  session,
  toolCallId,
  initialQuery,
}: {
  session: DesignSearchSession;
  toolCallId: string;
  initialQuery: string;
}) {
  const { onPick, busy } = session;
  const [draftQuery, setDraftQuery] = useState(initialQuery);
  const [explorer, setExplorer] = useState(() =>
    DesignSearchExplorer.create(initialQuery)
  );
  const explorerRef = useRef(explorer);
  const libraryRef = useRef<LibraryExplorerViewHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [submitted, setSubmitted] = useState(false);

  const disabled = busy || submitted;
  const selectedIds = useMemo(
    () => new Set(explorer.selectedPins.map((pin) => pin.id)),
    [explorer]
  );
  const librarySource = useMemo(
    () => ({ kind: "search", query: explorer.query }) as const,
    [explorer.query]
  );
  const toggle = useCallback(
    (pin: LibraryExplorerItem) => {
      if (disabled) return;
      const next = explorerRef.current.toggle(pin);
      explorerRef.current = next;
      setExplorer(next);
    },
    [disabled]
  );

  function submit(output: AgentDesignSearch.DesignSearchOutput) {
    if (submitted) return;
    setSubmitted(true);
    onPick(toolCallId, output);
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.currentTarget
      .querySelector<HTMLInputElement>('input[type="search"]')
      ?.blur();
    if (disabled) return;
    const current = explorerRef.current;
    const next = current.refine(draftQuery);
    setDraftQuery(next.query);
    if (next === current) return;
    explorerRef.current = next;
    setExplorer(next);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }

  function removeSelected(id: string) {
    if (disabled) return;
    const next = explorerRef.current.remove(id);
    explorerRef.current = next;
    setExplorer(next);
  }

  return (
    <div className="relative flex h-full w-full flex-col bg-background">
      <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
        <form onSubmit={search} className="min-w-0 flex-1">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Search the Library"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="Search the Library"
              disabled={disabled}
              className="h-8 pl-8"
            />
          </div>
        </form>
      </header>

      {/* Chromium does not clip native app-region boxes to scrollports. Keep
          culled Library controls from leaving ghost no-drag rectangles over
          the title bar. See
          test/desktop-workbench-scrolled-library-drag-region.md. */}
      <div
        ref={scrollRef}
        className="desktop-native-drag-scroll-viewport min-h-0 flex-1 overflow-y-auto p-3 pb-24"
      >
        <LibraryExplorerView
          key={explorer.revision}
          ref={libraryRef}
          initialSource={librarySource}
          loadPage={resolveLibraryExplorerPage}
          selectedIds={selectedIds}
          onToggle={toggle}
          scrollContainerRef={scrollRef}
          disabled={disabled}
        />
      </div>

      <SelectionBar
        pins={explorer.selectedPins}
        disabled={disabled}
        onRemove={removeSelected}
        onUse={() => submit({ picked: explorer.selectedPins })}
        onNavigate={(pin) => libraryRef.current?.navigate(pin)}
      />
    </div>
  );
}

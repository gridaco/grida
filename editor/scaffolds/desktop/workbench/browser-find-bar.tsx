"use client";

import { useLayoutEffect, useRef } from "react";
import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import type { BrowserPageControls } from "@/lib/desktop/browser-page-controls";

export function BrowserFindBar({
  controls,
  state,
  focusPage,
}: {
  controls: BrowserPageControls.Controller;
  state: BrowserPageControls.State;
  focusPage(): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (state.findOpen) {
      input.current?.focus();
      input.current?.select();
    }
  }, [state.findOpen, state.focusRevision]);
  if (!state.findOpen) return null;
  return (
    <div
      data-testid="browser-find"
      role="search"
      aria-label="Find in page"
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          controls.closeFind();
          focusPage();
        }
      }}
      className="desktop-no-drag flex shrink-0 items-center gap-2 border-b bg-background px-3 py-2"
    >
      <input
        ref={input}
        aria-label="Find text"
        placeholder="Find in page"
        value={state.text}
        className="h-7 min-w-0 flex-1 rounded border bg-transparent px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        onChange={(event) => controls.setText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === "Enter") {
            event.preventDefault();
            void controls.next(!event.shiftKey);
          }
        }}
      />
      <span
        role="status"
        className="min-w-12 text-center text-[10px] text-muted-foreground"
      >
        {state.result
          ? `${state.result.activeMatchOrdinal}/${state.result.matches}`
          : state.finding
            ? "…"
            : ""}
      </span>
      <label className="flex items-center gap-1 text-[10px]">
        <input
          type="checkbox"
          checked={state.matchCase}
          onChange={(event) =>
            controls.setMatchCase(event.currentTarget.checked)
          }
        />
        Match case
      </label>
      <button
        type="button"
        aria-label="Previous match"
        disabled={!state.text}
        onClick={() => void controls.next(false)}
        className="rounded p-1 hover:bg-muted disabled:opacity-40"
      >
        <ChevronUpIcon className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Next match"
        disabled={!state.text}
        onClick={() => void controls.next(true)}
        className="rounded p-1 hover:bg-muted disabled:opacity-40"
      >
        <ChevronDownIcon className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Close find"
        onClick={() => {
          controls.closeFind();
          focusPage();
        }}
        className="rounded p-1 hover:bg-muted"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}

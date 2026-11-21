"use client";

import { Button } from "@app/ui/components/button";
import { ArrowDownToLineIcon, TextQuoteIcon, XIcon } from "lucide-react";
import { useRef, useState, type ClipboardEvent } from "react";
import type { ComposerController } from "@/kits/composer";
import {
  AgentComposerInput,
  type AgentComposerInputProps,
} from "@/scaffolds/desktop/shared/agent-composer-input";

const catalog: AgentComposerInputProps["catalog"] = {
  commands: [],
  mentions: [],
};

const sample = `Export preview opens on the wrong page after reordering slides

I opened a presentation with six slides and moved the last slide to the front. The canvas and thumbnail rail both showed the new order. The export preview still started on the old first slide, even after closing and reopening the preview.

Steps to reproduce
1. Create a presentation with six slides and give each slide a distinct heading.
2. Drag the last thumbnail to the first slot and select the new first slide.
3. Open the export preview from the toolbar.
4. Close the preview and reopen it without switching slides.

Expected: the preview opens on the slide selected in the thumbnail rail.
Observed: it opens on the previous first slide. Paging forward follows the updated order.

The issue also happens when the presentation is open in two windows. In that case, the second window reflects the order correctly after refresh, but its initial preview still opens on the old first slide. This was tested with a local copy of the presentation and six text-only slides.`;

type Paste = { id: string; text: string };

export function LongPasteDemo() {
  const draft = useRef<Pick<ComposerController, "appendText" | "focus">>(null);
  const [pastes, setPastes] = useState<Paste[]>([
    { id: "sample", text: sample },
  ]);

  const stage = (text: string) => {
    const entry = { id: crypto.randomUUID(), text };
    setPastes((current) => [...current, entry]);
  };

  const capturePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (
      !(event.target instanceof Element) ||
      !event.target.closest("[data-composer-editor]") ||
      event.clipboardData.files.length > 0
    ) {
      return;
    }
    const text = event.clipboardData
      .getData("text/plain")
      .replace(/\r\n?/g, "\n");
    // The threshold is only for exploring the interaction in the playground.
    if (
      !text.trim() ||
      (text.length < 1_000 && text.split("\n", 12).length < 12)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    stage(text);
  };

  const remove = (id: string) => {
    setPastes((current) => current.filter((paste) => paste.id !== id));
  };

  return (
    <div className="space-y-3" onPasteCapture={capturePaste}>
      <Button size="sm" variant="outline" onClick={() => stage(sample)}>
        Add sample paste
      </Button>
      <AgentComposerInput
        draftRef={draft}
        catalog={catalog}
        isStreaming={false}
        canSubmit={false}
        onSubmit={() => {}}
        onStop={() => {}}
        attachments={
          pastes.length > 0 &&
          pastes.map((paste) => (
            <PastedTextCard
              key={paste.id}
              text={paste.text}
              onRemove={() => {
                remove(paste.id);
                draft.current?.focus();
              }}
              onRestore={() => {
                if (draft.current?.appendText(paste.text, Infinity)) {
                  remove(paste.id);
                }
              }}
            />
          ))
        }
      />
    </div>
  );
}

function PastedTextCard({
  text,
  onRemove,
  onRestore,
}: {
  text: string;
  onRemove(): void;
  onRestore(): void;
}) {
  const [firstLine] = text.trimStart().split("\n", 1);
  const title =
    firstLine.length > 100 ? `${firstLine.slice(0, 100)}…` : firstLine;

  return (
    <div className="flex w-64 max-w-full min-w-0 items-start gap-2 rounded-lg border bg-background px-2 py-1.5">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <TextQuoteIcon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={title}>
          {title}
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-1 focus-visible:ring-ring"
          onClick={onRestore}
        >
          <ArrowDownToLineIcon aria-hidden="true" className="size-3" />
          Show in text field
        </button>
      </div>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        className="-me-0.5 -mt-0.5 text-muted-foreground"
        aria-label="Remove pasted text"
        onClick={onRemove}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

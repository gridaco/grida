"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { LoaderCircleIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import { ComposerContent, ComposerProvider } from "@/kits/composer";
import { ComposerTiptap } from "@/kits/composer/composer-tiptap";
import { WorkspaceMention } from "@/kits/composer/workspace-mention";

const revisionCatalog = { commands: [], mentions: [] };

/** A controlled edit of a sent user message; the consumer owns resubmission. */
export type ChatMessageEdit = {
  text: string;
  submitting?: boolean;
  readOnly?: boolean;
  submitDisabled?: boolean;
  submitLabel?: string;
  note?: ReactNode;
  onChange: (text: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function ChatMessageEditor({ edit }: { edit: ChatMessageEdit }) {
  const [document] = useState(() =>
    WorkspaceMention.inline(edit.text).length
      ? ComposerTiptap.markdownDocument(edit.text)
      : undefined
  );
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const field = input.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
    field.scrollTop = field.scrollHeight;
  }, []);
  const locked = edit.submitting || edit.readOnly;
  const canSubmit =
    !edit.submitting && !edit.submitDisabled && !!edit.text.trim();
  return (
    <form
      data-testid="chat-message-editor"
      aria-label="Edit a previous message"
      aria-busy={edit.submitting || undefined}
      className="flex w-full flex-col gap-3 rounded-xl bg-secondary px-4 py-3 text-foreground"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) edit.onSubmit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !locked) {
          event.preventDefault();
          event.stopPropagation();
          edit.onCancel();
        }
      }}
    >
      {document ? (
        <ComposerProvider catalog={revisionCatalog}>
          <ComposerContent
            initialDocument={document}
            editorAriaLabel="Replacement message"
            editorClassName="min-h-24 max-h-80 overflow-y-auto text-[15px] leading-6"
            placeholder=""
            autofocus
            readOnly={locked}
            onPromptChange={edit.onChange}
            onSubmitRequest={() => {
              if (canSubmit) edit.onSubmit();
            }}
          />
        </ComposerProvider>
      ) : (
        <textarea
          aria-label="Replacement message"
          ref={input}
          className="field-sizing-content min-h-24 max-h-80 w-full resize-none bg-transparent text-[15px] leading-6 outline-none"
          value={edit.text}
          readOnly={locked}
          onChange={(event) => edit.onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.keyCode !== 229
            ) {
              event.preventDefault();
              event.stopPropagation();
              if (canSubmit) edit.onSubmit();
            }
          }}
        />
      )}
      <footer className="flex flex-wrap items-end justify-end gap-x-4 gap-y-3">
        {edit.note && (
          <div className="min-w-40 flex-1 space-y-1 text-xs text-muted-foreground">
            {edit.note}
          </div>
        )}
        <div className="flex shrink-0 justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={locked}
            onClick={edit.onCancel}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {edit.submitting && (
              <LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" />
            )}
            {edit.submitting ? "Sending…" : (edit.submitLabel ?? "Send")}
          </Button>
        </div>
      </footer>
    </form>
  );
}

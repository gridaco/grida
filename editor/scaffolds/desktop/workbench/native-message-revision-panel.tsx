"use client";

import { Button } from "@app/ui/components/button";
import { Textarea } from "@app/ui/components/textarea";

export function NativeMessageRevisionPanel({
  draft,
  submitting,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: {
    text: string;
    subsequentMessages: number;
    unverified: boolean;
  };
  submitting: boolean;
  onChange: (text: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const later = draft.subsequentMessages;
  return (
    <form
      aria-label="Edit a previous message"
      className="grid shrink-0 gap-2 border-t px-3 py-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="text-xs font-medium">Edit and resubmit</div>
      <p className="text-xs text-muted-foreground">
        This replaces the selected message
        {later > 0 &&
          ` and ${later} later ${later === 1 ? "message" : "messages"}`}
        {
          " in the active chat. The previous view and the effects of completed work are retained."
        }
      </p>
      <Textarea
        aria-label="Replacement message"
        className="max-h-36 min-h-20 resize-y text-sm"
        value={draft.text}
        readOnly={submitting || draft.unverified}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={submitting || draft.unverified}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="xs"
          disabled={submitting || !draft.text.trim()}
        >
          {submitting
            ? "Submitting…"
            : draft.unverified
              ? "Retry edit"
              : "Resubmit"}
        </Button>
      </div>
    </form>
  );
}

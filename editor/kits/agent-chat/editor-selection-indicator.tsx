import { ScanTextIcon } from "lucide-react";
import { cn } from "@app/ui/lib/utils";

/** An editor context label shared by a draft and its sent message. */
export function EditorSelectionIndicator({
  kind,
  className,
}: {
  kind: "svg-text";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-border/70 px-1.5 py-0.5 text-xs text-muted-foreground",
        className
      )}
    >
      <ScanTextIcon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">{LABELS[kind]}</span>
    </span>
  );
}

const LABELS = {
  "svg-text": "SVG text selection",
} as const;

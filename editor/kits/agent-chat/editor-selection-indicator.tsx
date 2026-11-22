import { ScanIcon, XIcon } from "lucide-react";
import { cn } from "@app/ui/lib/utils";

/** An editor context label shared by a draft and its sent message. */
export function EditorSelectionIndicator({
  label,
  className,
  onClear,
}: {
  label: string;
  className?: string;
  onClear?: () => void;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-border/70 px-1.5 py-0.5 text-xs text-muted-foreground",
        className
      )}
    >
      <ScanIcon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      {onClear && (
        <button
          type="button"
          aria-label="Clear selection"
          onClick={onClear}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <XIcon aria-hidden="true" className="size-3" />
        </button>
      )}
    </span>
  );
}

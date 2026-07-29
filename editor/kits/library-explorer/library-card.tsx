"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, PlusIcon } from "lucide-react";
import { cn } from "@app/ui/lib/utils";
import type { LibraryExplorerItem } from "./library-explorer";
import type { LibraryFocusFeedback } from "./library-focus-feedback";

// Let the initial "Added" acknowledgement settle before collapsing to the icon.
const ADDED_LABEL_HANDOFF_MS = 100;

export function LibrarySelectionAction({
  selected,
  disabled,
  size = "default",
  onToggle,
}: {
  selected: boolean;
  disabled: boolean;
  size?: "compact" | "default" | "large";
  onToggle: () => void;
}) {
  const compact = size === "compact";
  const [showAddedLabel, setShowAddedLabel] = useState(false);
  const addedLabelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (addedLabelTimerRef.current !== null) {
        clearTimeout(addedLabelTimerRef.current);
      }
    };
  }, []);

  const toggle = () => {
    if (addedLabelTimerRef.current !== null) {
      clearTimeout(addedLabelTimerRef.current);
      addedLabelTimerRef.current = null;
    }

    if (selected) {
      setShowAddedLabel(false);
    } else {
      setShowAddedLabel(true);
      addedLabelTimerRef.current = setTimeout(() => {
        setShowAddedLabel(false);
        addedLabelTimerRef.current = null;
      }, ADDED_LABEL_HANDOFF_MS);
    }
    onToggle();
  };

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      aria-label={selected ? "Remove from selection" : "Add to selection"}
      onClick={toggle}
      className={cn(
        "group/action z-20 flex items-center justify-center rounded-full font-medium shadow transition-all disabled:opacity-50",
        size === "compact"
          ? "size-6 text-xs"
          : size === "large"
            ? "px-3 py-2 text-sm"
            : "px-2 py-1 text-xs",
        selected
          ? cn(
              "bg-primary text-primary-foreground",
              showAddedLabel ? "gap-1" : "gap-0 hover:gap-1 focus-visible:gap-1"
            )
          : "gap-1 bg-background/90 text-foreground hover:bg-background"
      )}
    >
      {selected ? (
        <>
          <CheckIcon className={size === "large" ? "size-4" : "size-3.5"} />
          {!compact && (
            <span
              className={cn(
                "overflow-hidden whitespace-nowrap transition-all duration-150",
                showAddedLabel
                  ? "max-w-12 opacity-100"
                  : "max-w-0 opacity-0 group-hover/action:max-w-12 group-hover/action:opacity-100 group-focus-visible/action:max-w-12 group-focus-visible/action:opacity-100"
              )}
            >
              Added
            </span>
          )}
        </>
      ) : (
        <>
          <PlusIcon className={size === "large" ? "size-4" : "size-3.5"} />
          {!compact && "Add"}
        </>
      )}
    </button>
  );
}

export function LibraryCard({
  item,
  width,
  selected,
  disabled,
  compact,
  onOpen,
  onToggle,
  focusFeedback,
}: {
  item: LibraryExplorerItem;
  width: number;
  selected: boolean;
  disabled: boolean;
  compact: boolean;
  onOpen: (item: LibraryExplorerItem) => void;
  onToggle: (item: LibraryExplorerItem) => void;
  focusFeedback: LibraryFocusFeedback;
}) {
  const aspect = item.width && item.height ? item.width / item.height : 1;
  const height = width / aspect;

  return (
    <div
      ref={focusFeedback.ref(item.id)}
      style={{ width, height }}
      className={cn(
        "group relative block rounded-lg transition",
        compact ? "rounded-md" : "border-2 border-transparent",
        selected && "ring-2 ring-primary/25"
      )}
    >
      <button
        type="button"
        data-library-card-open
        disabled={disabled}
        onClick={() => onOpen(item)}
        aria-label={`View more like ${item.title}`}
        className="absolute inset-0 block size-full overflow-hidden rounded-[inherit] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.url}
          alt={item.title}
          loading="lazy"
          draggable={false}
          className={cn(
            "size-full select-none object-cover transition",
            selected && "brightness-90"
          )}
        />
      </button>
      <div
        className={cn(
          "pointer-events-none absolute z-20 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
          compact ? "right-1 top-1" : "right-1.5 top-1.5",
          selected && "opacity-100"
        )}
      >
        <div className="pointer-events-auto">
          <LibrarySelectionAction
            selected={selected}
            disabled={disabled}
            size={compact ? "compact" : "default"}
            onToggle={() => onToggle(item)}
          />
        </div>
      </div>
    </div>
  );
}

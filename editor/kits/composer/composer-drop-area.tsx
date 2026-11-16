"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type HTMLAttributes,
} from "react";
import { cn } from "@app/ui/lib/utils";
import { ComposerDropZone } from "./composer-drop-zone";
import type { ComposerTransfer } from "./composer-transfer";

/**
 * A surface that accepts operating-system file and folder drops anywhere
 * inside it and forwards them through the composer's transfer intake. Behaviour
 * lives in {@link ComposerDropZone}; this component only attaches it and draws
 * the highlight while a file drag is over the surface.
 */
export function ComposerDropArea({
  onTransfer,
  label = "Drop to attach",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  /** Receives the same envelope the composer editor forwards for a drop. */
  onTransfer: (event: ComposerTransfer.Event) => void;
  label?: string;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const onTransferRef = useRef(onTransfer);
  onTransferRef.current = onTransfer;
  const [zone] = useState(
    () => new ComposerDropZone((event) => onTransferRef.current(event))
  );
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    return zone.connect(element, window);
  }, [zone]);
  const active = useSyncExternalStore(
    zone.subscribe,
    zone.getSnapshot,
    zone.getSnapshot
  );
  return (
    <div ref={surface} className={cn("relative", className)} {...props}>
      {children}
      {active && <ComposerDropOverlay label={label} />}
    </div>
  );
}

/** The purely visual highlight; it never receives pointer or drag events. */
export function ComposerDropOverlay({ label }: { label: string }) {
  return (
    <div
      aria-hidden
      data-composer-drop-overlay=""
      className="pointer-events-none absolute inset-1 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/40 bg-muted/80 text-sm text-muted-foreground"
    >
      {label}
    </div>
  );
}

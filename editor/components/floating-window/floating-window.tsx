"use client";

import React, { useState } from "react";
import { cn } from "@/components/lib/utils";
import {
  FloatingWindowHost as PrimitiveHost,
  FloatingWindowBounds as PrimitiveBounds,
  FloatingWindowRoot as PrimitiveRoot,
  FloatingWindowTitleBar as PrimitiveTitleBar,
  FloatingWindowBody as PrimitiveBody,
  FloatingWindowTrigger as PrimitiveTrigger,
  FloatingWindowClose as PrimitiveClose,
  FloatingWindowPortal as PrimitivePortal,
  ErrorBoundary as PrimitiveErrorBoundary,
  useFloatingWindowControls,
  type FloatingWindowRootProps,
  type FloatingWindowRenderProps,
  type TitleBarProps,
  type FloatingWindowBoundsProps,
  type TriggerProps,
  type CloseProps,
} from "./primitives";

export {
  useFloatingWindowControls,
  type FloatingWindowRootProps,
  type TitleBarProps,
  type FloatingWindowBoundsProps,
  type TriggerProps,
  type CloseProps,
};

function DefaultWindowCrashFallback({
  onReload,
  onClose,
}: {
  onReload: () => void;
  onClose: () => void;
}) {
  return (
    <div className="h-full w-full p-3">
      <div className="rounded-md border bg-background p-3">
        <div className="text-sm font-medium">Panel crashed</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Something went wrong inside this floating window.
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
            onClick={onReload}
          >
            Reload panel
          </button>
          <button
            type="button"
            className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function FloatingWindowHost(props: React.PropsWithChildren<{}>) {
  return <PrimitiveHost {...props} />;
}

export function FloatingWindowBounds(props: FloatingWindowBoundsProps) {
  return (
    <PrimitiveBounds
      {...props}
      className={cn(
        "relative w-full h-full overflow-hidden data-[floating-window-bounds]",
        props.className
      )}
    />
  );
}

export function FloatingWindowRoot(props: FloatingWindowRootProps) {
  const {
    className,
    transition = "transform 160ms ease",
    render,
    children,
    windowId,
    ...rest
  } = props;
  const [contentResetKey, setContentResetKey] = useState(0);

  return (
    <PrimitiveRoot
      {...rest}
      windowId={windowId}
      transition={transition}
      className={cn(
        "absolute pointer-events-auto shadow-lg rounded-md bg-background border",
        className
      )}
      render={(helpers) => {
        const rendered =
          render?.(helpers) ??
          (typeof children === "function"
            ? (children as (h: FloatingWindowRenderProps) => React.ReactNode)(
                helpers
              )
            : children);

        return (
          <PrimitiveErrorBoundary
            resetKeys={[windowId, contentResetKey]}
            onError={(error) => {
              console.error(`[FloatingWindow:${windowId}] crashed`, error);
            }}
            fallback={({ reset }) => (
              <DefaultWindowCrashFallback
                onReload={() => {
                  setContentResetKey((k) => k + 1);
                  reset();
                }}
                onClose={() => helpers.controls.closeWindow()}
              />
            )}
          >
            {rendered}
          </PrimitiveErrorBoundary>
        );
      }}
    />
  );
}

export function FloatingWindowTitleBar(props: TitleBarProps) {
  const { className, ...rest } = props;
  return (
    <PrimitiveTitleBar
      {...rest}
      className={cn(
        "flex items-center gap-2 px-3 py-2 border-b bg-muted/60 select-none cursor-grab active:cursor-grabbing",
        className
      )}
    />
  );
}

export function FloatingWindowBody(
  props: React.HTMLAttributes<HTMLDivElement>
) {
  const { className, ...rest } = props;
  return (
    <PrimitiveBody {...rest} className={cn("p-3 overflow-auto", className)} />
  );
}

export function FloatingWindowTrigger(props: TriggerProps) {
  return <PrimitiveTrigger {...props} />;
}

export function FloatingWindowClose(props: CloseProps) {
  return <PrimitiveClose {...props} />;
}

export function FloatingWindowPortal(
  props: React.ComponentProps<typeof PrimitivePortal>
) {
  return <PrimitivePortal {...props} />;
}

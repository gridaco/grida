"use client";

import React from "react";
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
  useFloatingWindowControls,
  type FloatingWindowRootProps,
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
  const { className, transition = "transform 160ms ease", ...rest } = props;
  return (
    <PrimitiveRoot
      {...rest}
      transition={transition}
      className={cn(
        "absolute pointer-events-auto shadow-lg rounded-md bg-background border",
        className
      )}
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

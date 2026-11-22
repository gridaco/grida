"use client";

import { cn } from "@app/ui/lib/utils";
import { type CSSProperties, type ElementType, memo } from "react";

export type TextShimmerProps = {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
};

const ShimmerComponent = ({
  children,
  as: Component = "p",
  className,
  duration,
  spread,
}: TextShimmerProps) => {
  return (
    <Component
      className={cn(
        "shimmer relative inline-block text-muted-foreground",
        className
      )}
      style={
        {
          "--shimmer-duration":
            duration === undefined ? undefined : `${duration}s`,
          "--shimmer-spread":
            spread === undefined ? undefined : `${children.length * spread}px`,
        } as CSSProperties
      }
    >
      {children}
    </Component>
  );
};

export const Shimmer = memo(ShimmerComponent);

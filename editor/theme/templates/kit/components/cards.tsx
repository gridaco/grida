import React from "react";
import { cn } from "@/components/lib/utils";

export function CardBackgroundGradientBlur({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div className="relative w-full h-full">
      <div
        className={cn(
          "-z-10 absolute inset-0 w-full h-full backdrop-blur-xl bg-gradient-to-b from-transparent to-background/40",
          className
        )}
      ></div>
      {children}
    </div>
  );
}

export function CardBackgroundGradient({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div className="relative w-full h-full">
      <div
        className={cn(
          "-z-10 absolute inset-0 w-full h-full bg-gradient-to-b from-transparent to-background/80",
          className
        )}
      ></div>
      {children}
    </div>
  );
}

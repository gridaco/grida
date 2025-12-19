"use client";

import React from "react";
import Image from "next/image";
import { cn } from "@/components/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

export type PillProps = {
  label: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  thumbnail?: string;
  unoptimized?: boolean;
};

export function Pill({
  label,
  active = false,
  onClick,
  disabled = false,
  className,
  thumbnail,
  unoptimized = false,
}: PillProps) {
  return (
    <button
      data-has-thumbnail={!!thumbnail}
      className={cn(
        "inline-flex items-center gap-1 h-7 rounded-full border py-1 text-[11px] whitespace-nowrap",
        "px-2.5 data-[has-thumbnail=true]:ps-1",
        active
          ? "bg-primary text-primary-foreground"
          : "text-foreground/80 hover:bg-muted",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {thumbnail && (
        <span className="relative inline-flex size-5 overflow-hidden rounded-full bg-muted">
          <Image
            src={thumbnail}
            alt={label}
            fill
            sizes="24px"
            className="object-cover"
            unoptimized={unoptimized}
          />
        </span>
      )}
      {label}
    </button>
  );
}

export type PillsListProps = {
  children: React.ReactNode;
  className?: string;
};

export function PillsList({ children, className }: PillsListProps) {
  return (
    <div className={cn("relative", className)}>
      <ScrollArea type="scroll" className="w-full">
        <div className="flex gap-1 px-2">{children}</div>
        <ScrollBar orientation="horizontal" className="hidden" />
      </ScrollArea>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-2 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}

"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { InfoIcon } from "lucide-react";
import { cn } from "@/components/lib/utils";

export interface ContextBadgeProps {
  context?: {
    nodes: unknown[];
    summary: string;
  } | null;
  className?: string;
}

export function ContextBadge({ context, className }: ContextBadgeProps) {
  if (!context || context.nodes.length === 0) {
    return null;
  }

  return (
    <Badge
      variant="secondary"
      className={cn("flex items-center gap-1.5 text-xs", className)}
    >
      <InfoIcon className="size-3" />
      <span>{context.summary}</span>
    </Badge>
  );
}

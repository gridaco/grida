"use client";

import type { ReactNode } from "react";
import { Button } from "@app/ui/components/button";

export function AgentApprovalPrompt({
  description,
  detail,
  acceptLabel,
  declineLabel,
  disabled,
  onDecision,
}: {
  description: string;
  detail: ReactNode;
  acceptLabel: string;
  declineLabel: string;
  disabled?: boolean;
  onDecision: (approved: boolean) => void | Promise<void>;
}) {
  return (
    <div className="shrink-0 bg-muted/30 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{description}</p>
          {detail}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => void onDecision(false)}
          >
            {declineLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={() => void onDecision(true)}
          >
            {acceptLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

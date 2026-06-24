"use client";

/**
 * Step 2 — choose your AI. Claude is ONE of the items here (the recommended
 * one), auto-detected via {@link providers.detectClaude}; the alternatives
 * (BYOK key, local Ollama) route into Settings. Detection is the cheap host-side
 * probe — it does NOT verify login; the first real run is the source of truth.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@app/ui/components/dialog";
import { providers } from "@/lib/desktop/bridge";
import type { OnboardingStepProps } from "../types";

type Detect = "checking" | "installed" | "missing";

export function AiStep({ openSettings }: OnboardingStepProps) {
  const [claude, setClaude] = useState<Detect>("checking");

  const detect = useCallback(async () => {
    setClaude("checking");
    try {
      const { installed } = await providers.detectClaude();
      setClaude(installed ? "installed" : "missing");
    } catch {
      // Can't probe (web bridge / old binary) — don't block; the first real
      // run is the gate.
      setClaude("installed");
    }
  }, []);

  useEffect(() => {
    void detect();
  }, [detect]);

  return (
    <div data-testid="onboarding-step-ai" className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Choose your AI</DialogTitle>
        <DialogDescription>
          Grida runs on your own Claude by default.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        {/* Claude — the recommended item. */}
        <div className="rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Claude Code</span>
            {claude === "checking" && (
              <span className="shrink-0 text-xs text-muted-foreground">
                Checking…
              </span>
            )}
            {claude === "installed" && (
              <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <CheckIcon className="size-3.5" />
                Detected
              </span>
            )}
            {claude === "missing" && (
              <span className="shrink-0 text-xs text-muted-foreground">
                Not found
              </span>
            )}
          </div>
          {claude === "missing" && (
            <div className="mt-2 flex flex-col gap-2 border-t pt-2 text-xs text-muted-foreground">
              <code className="rounded bg-muted px-2 py-1 font-mono text-foreground">
                npm install -g @anthropic-ai/claude-code
              </code>
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                onClick={() => void detect()}
              >
                I&apos;ve installed it
              </Button>
            </div>
          )}
        </div>

        {/* Alternatives — one compact link into Settings (leaves onboarding). */}
        <button
          type="button"
          onClick={openSettings}
          className="self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Use your own key or a local model
        </button>
      </div>
    </div>
  );
}

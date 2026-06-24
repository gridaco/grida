"use client";

import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@app/ui/components/dialog";
import type { OnboardingStepProps } from "../types";

/** Step 4 — recap + hand off to the composer. */
export function FinishStep({ state }: OnboardingStepProps) {
  return (
    <div data-testid="onboarding-step-finish" className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>You&apos;re all set</DialogTitle>
        <DialogDescription>
          {state.openedWorkspace
            ? `Describe what to build in ${state.openedWorkspace.name} — the agent takes it from there.`
            : "Describe what to build — the agent takes it from there."}
        </DialogDescription>
      </DialogHeader>
    </div>
  );
}

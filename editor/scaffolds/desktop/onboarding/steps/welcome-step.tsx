"use client";

import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@app/ui/components/dialog";

/** Step 1 — what Grida Desktop is + the on-your-own-subscription value prop. */
export function WelcomeStep() {
  return (
    <div data-testid="onboarding-step-welcome" className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Welcome to Grida Desktop</DialogTitle>
        <DialogDescription>
          Design and build on your machine, powered by your own Claude.
        </DialogDescription>
      </DialogHeader>
    </div>
  );
}

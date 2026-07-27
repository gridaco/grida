"use client";

import { Button } from "@app/ui/components/button";
import type { OnboardingStepProps } from "../types";

export function WelcomeStep({ next }: OnboardingStepProps) {
  return (
    <div
      data-testid="onboarding-step-welcome"
      className="flex min-h-full flex-1 flex-col gap-5"
    >
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">
          Welcome to Grida Desktop
        </h1>
        <p className="text-sm text-muted-foreground">
          Design, build, and iterate with an agent that works alongside you.
        </p>
      </div>

      <div className="mt-auto flex justify-center pt-8">
        <Button className="w-full max-w-64" onClick={next}>
          Continue
        </Button>
      </div>
    </div>
  );
}

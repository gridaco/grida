"use client";

import { Button } from "@/components/ui/button";

interface WizardNavProps {
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  isLastStep: boolean;
}

export function WizardNav({
  currentStep,
  totalSteps,
  onNext,
  onBack,
  isLastStep,
}: WizardNavProps) {
  return (
    <div className="p-6 border-t bg-muted/20 flex items-center justify-between">
      <div className="text-sm text-muted-foreground">
        Step {currentStep + 1} of {totalSteps}
      </div>
      <div className="flex gap-2">
        {currentStep > 0 && (
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
        )}
        <Button onClick={onNext}>
          {isLastStep ? "Create Campaign" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

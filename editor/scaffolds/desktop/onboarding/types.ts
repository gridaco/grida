import type { Workspace } from "@/lib/desktop/bridge";

export type OnboardingState = {
  openedWorkspace: Workspace | null;
};

export type OnboardingStepProps = {
  state: OnboardingState;
  update: (patch: Partial<OnboardingState>) => void;
  next: () => void;
};

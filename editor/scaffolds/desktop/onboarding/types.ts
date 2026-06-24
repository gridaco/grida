import type { Workspace } from "@/lib/desktop/bridge";

/** State shared across onboarding steps (carried by the orchestrator). */
export type OnboardingState = {
  /** A folder the user opened during the workspace step, if any. */
  openedWorkspace: Workspace | null;
};

/** Props every onboarding step body receives from the orchestrator. */
export type OnboardingStepProps = {
  state: OnboardingState;
  /** Merge a patch into the shared state. */
  update: (patch: Partial<OnboardingState>) => void;
  /** Advance to the next step (or finish on the last one). */
  next: () => void;
  /** Mark onboarding done and close the modal. */
  complete: () => void;
  /** Finish onboarding and jump to Settings (the BYOK / local-model setup). */
  openSettings: () => void;
};

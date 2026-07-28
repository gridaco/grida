"use client";

import { useCallback } from "react";
import { getDesktopBridge, type Workspace } from "@/lib/desktop/bridge";
import { FirstRunOnboarding } from "@/scaffolds/desktop/onboarding/first-run-onboarding";

/**
 * Full-window onboarding surface for the canonical Desktop entry window.
 */
export default function DesktopOnboardingPage() {
  const finish = useCallback(async (workspace?: Workspace) => {
    const complete = getDesktopBridge()?.window.complete_onboarding;
    if (!complete) {
      console.error("[onboarding] native entry controller unavailable");
      return;
    }
    try {
      await complete(workspace?.id);
    } catch (error) {
      // A successful native transition replaces this document before the
      // invoke reply necessarily reaches it. Never race that one owner with a
      // renderer navigation.
      console.warn("[onboarding] native completion interrupted:", error);
    }
  }, []);

  return <FirstRunOnboarding onDone={(workspace) => void finish(workspace)} />;
}

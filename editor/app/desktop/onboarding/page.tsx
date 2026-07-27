"use client";

import { useCallback, useEffect, useState } from "react";
import { getDesktopBridge, type Workspace } from "@/lib/desktop/bridge";
import { onboarding_flag } from "@/lib/desktop/onboarding-flag";
import { FirstRunOnboarding } from "@/scaffolds/desktop/onboarding/first-run-onboarding";

/**
 * Full-window onboarding surface for the canonical Desktop entry window.
 *
 * The localStorage check migrates users who completed the former Welcome
 * dialog: their first launch on the entry-window build immediately records
 * host completion and continues without replaying onboarding.
 */
export default function DesktopOnboardingPage() {
  const [checkingLegacyCompletion, setCheckingLegacyCompletion] =
    useState(true);

  const finish = useCallback(async (workspace?: Workspace) => {
    const complete = getDesktopBridge()?.window.complete_onboarding;
    if (!complete) {
      console.error("[onboarding] native entry controller unavailable");
      return;
    }
    onboarding_flag.markComplete();
    try {
      await complete(workspace?.id);
    } catch (error) {
      // A successful native transition replaces this document before the
      // invoke reply necessarily reaches it. Never race that one owner with a
      // renderer navigation.
      console.warn("[onboarding] native completion interrupted:", error);
    }
  }, []);

  useEffect(() => {
    if (onboarding_flag.isComplete()) {
      void finish();
      return;
    }
    setCheckingLegacyCompletion(false);
  }, [finish]);

  if (checkingLegacyCompletion) {
    return <div className="h-svh w-full bg-background" aria-hidden />;
  }

  return <FirstRunOnboarding onDone={(workspace) => void finish(workspace)} />;
}

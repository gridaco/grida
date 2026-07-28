"use client";

import { useCallback, useState } from "react";
import { Button } from "@app/ui/components/button";
import { getDesktopBridge, type Workspace } from "@/lib/desktop/bridge";
import { FirstRunOnboarding } from "@/scaffolds/desktop/onboarding/first-run-onboarding";

/**
 * Full-window onboarding surface for the canonical Desktop entry window.
 */
export default function DesktopOnboardingPage() {
  const [completionFailure, setCompletionFailure] = useState<{
    workspace?: Workspace;
  } | null>(null);

  const finish = useCallback(async (workspace?: Workspace) => {
    setCompletionFailure(null);
    const complete = getDesktopBridge()?.window.complete_onboarding;
    if (!complete) {
      console.error("[onboarding] native entry controller unavailable");
      setCompletionFailure({ workspace });
      return;
    }
    try {
      await complete(workspace?.id);
    } catch (error) {
      // A successful native transition replaces this document before the
      // invoke reply necessarily reaches it. Never race that one owner with a
      // renderer navigation.
      console.warn("[onboarding] native completion interrupted:", error);
      // If the native transition succeeded, this document has already been
      // replaced and this state is never presented. If it did not, keep the
      // user on the final step with an explicit retry.
      setCompletionFailure({ workspace });
    }
  }, []);

  return (
    <>
      <FirstRunOnboarding onDone={(workspace) => void finish(workspace)} />
      {completionFailure ? (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-4 z-30 mx-auto flex w-fit max-w-md items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm shadow-lg"
        >
          <span>Setup couldn&apos;t finish.</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void finish(completionFailure.workspace)}
          >
            Try again
          </Button>
        </div>
      ) : null}
    </>
  );
}

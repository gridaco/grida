"use client";

/**
 * First-run onboarding modal (issue #813 zero-config Claude).
 *
 * A dedicated multi-step wizard shown once to a new desktop user (gated by
 * {@link onboarding_flag}): Welcome → Choose your AI → Open a workspace →
 * You're all set. Claude detection is ONE item inside the "Choose your AI"
 * step ({@link AiStep}), not the whole flow.
 *
 * This orchestrator owns only the chrome: the non-dismissible {@link Dialog},
 * step navigation, the progress dots, and the shared {@link OnboardingState}.
 * Each step is a self-contained body in `./steps`; reorder/add/remove by
 * editing the `STEPS` array. Never a hard wall — every step has Skip.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@app/ui/components/button";
import { Dialog, DialogContent } from "@app/ui/components/dialog";
import { cn } from "@app/ui/lib/utils";
import { onboarding_flag } from "@/lib/desktop/onboarding-flag";
import type { OnboardingState, OnboardingStepProps } from "./types";
import { WelcomeStep } from "./steps/welcome-step";
import { AiStep } from "./steps/ai-step";
import { WorkspaceStep } from "./steps/workspace-step";
import { FinishStep } from "./steps/finish-step";

type StepDef = {
  /** Doubles as the artwork basename: `/onboarding/<id>.svg` (+ `-dark`). */
  id: string;
  Body: React.ComponentType<OnboardingStepProps>;
};

const STEPS: StepDef[] = [
  { id: "welcome", Body: WelcomeStep },
  { id: "ai", Body: AiStep },
  { id: "workspace", Body: WorkspaceStep },
  { id: "finish", Body: FinishStep },
];

export function FirstRunOnboarding({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<OnboardingState>({
    openedWorkspace: null,
  });

  const update = useCallback((patch: Partial<OnboardingState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const complete = useCallback(() => {
    onboarding_flag.markComplete();
    onDone();
  }, [onDone]);

  const openSettings = useCallback(() => {
    // Choosing an alternative provider finishes onboarding and hands off to the
    // settings setup (BYOK / Ollama) — don't re-prompt next launch.
    onboarding_flag.markComplete();
    router.push("/desktop/settings");
  }, [router]);

  const isLast = index === STEPS.length - 1;

  const next = useCallback(() => {
    if (index === STEPS.length - 1) complete();
    else setIndex((i) => i + 1);
  }, [index, complete]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  const Step = STEPS[index].Body;
  const stepId = STEPS[index].id;
  const stepProps: OnboardingStepProps = {
    state,
    update,
    next,
    complete,
    openSettings,
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) complete();
      }}
    >
      <DialogContent
        data-testid="first-run-onboarding"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        // `p-0` so the artwork header is full-bleed; padding is re-applied to the
        // text + footer only. Fixed min-height + a growing step region keeps the
        // dialog the same size across steps (the footer never jumps).
        className="flex min-h-[27rem] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        {/* Full-bleed artwork header — no padding. Static SVGs from /public; a
            baked light/dark pair is swapped by the class-based theme. Plain
            <img> (not next/image) — the /desktop CSP blocks the optimizer
            roundtrip (GRIDA-SEC-004). */}
        <div className="flex h-40 shrink-0 items-center justify-center border-b bg-muted/30">
          {/* eslint-disable-next-line @next/next/no-img-element -- static in-tree asset; next/image optimizer is CSP-blocked under /desktop */}
          <img
            src={`/onboarding/${stepId}.svg`}
            alt=""
            aria-hidden
            width={224}
            height={112}
            className="dark:hidden"
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- static in-tree asset; next/image optimizer is CSP-blocked under /desktop */}
          <img
            src={`/onboarding/${stepId}-dark.svg`}
            alt=""
            aria-hidden
            width={224}
            height={112}
            className="hidden dark:block"
          />
        </div>

        {/* Step text/controls — grows and centers so short steps fill the
            dialog without shrinking it or pooling whitespace at the bottom. */}
        <div className="flex flex-1 flex-col justify-center px-6 py-5">
          <Step {...stepProps} />
        </div>

        {/* Action footer — divider, progress dots, nav. */}
        <div className="border-t" />
        <div className="flex items-center justify-between gap-2 px-6 pb-6 pt-4">
          <div
            className="flex items-center gap-1.5"
            aria-label={`Step ${index + 1} of ${STEPS.length}`}
          >
            {STEPS.map((s, i) => (
              <span
                key={s.id}
                className={cn(
                  "size-1.5 rounded-full",
                  i === index ? "bg-foreground" : "bg-muted"
                )}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {index > 0 && (
              <Button variant="ghost" onClick={back}>
                Back
              </Button>
            )}
            {!isLast && (
              <Button variant="ghost" onClick={complete}>
                Skip
              </Button>
            )}
            <Button onClick={next}>
              {isLast ? "Get started" : "Continue"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

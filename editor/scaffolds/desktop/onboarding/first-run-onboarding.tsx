"use client";
// GRIDA-SEC-008 — native-provider sign-in consumes only secret-free status.

/**
 * First-run desktop onboarding.
 *
 * A short guide shown as the canonical entry window's onboarding surface:
 * Welcome → ChatGPT → Workspace. Each step has dedicated artwork.
 *
 * Interaction contract: test/desktop-onboarding-chatgpt-subscription.md
 */

import { useCallback, useState } from "react";
import { CheckIcon, Loader2 } from "lucide-react";
import { Button } from "@app/ui/components/button";
import { OpenAILogo } from "@grida/react-icons/logos";
import * as chatgptSubscription from "@/lib/desktop/chatgpt-subscription";
import { useChatGptSubscription } from "@/lib/desktop/chatgpt-subscription-react";
import type { Workspace } from "@/lib/desktop/bridge";
import type { OnboardingState, OnboardingStepProps } from "./types";
import { WelcomeStep } from "./steps/welcome-step";
import { WorkspaceStep } from "./steps/workspace-step";

type StepDef = {
  id: string;
  Body: React.ComponentType<OnboardingStepProps>;
  artwork: string;
};

const STEPS: StepDef[] = [
  {
    id: "welcome",
    Body: WelcomeStep,
    artwork: "/onboarding/welcome.webp",
  },
  {
    id: "chatgpt",
    Body: ChatGptStep,
    artwork: "/onboarding/chatgpt.webp",
  },
  {
    id: "workspace",
    Body: WorkspaceStep,
    artwork: "/onboarding/workspace.webp",
  },
];

export function FirstRunOnboarding({
  onDone,
}: {
  onDone: (openedWorkspace?: Workspace) => void;
}) {
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<OnboardingState>({
    openedWorkspace: null,
  });

  const update = useCallback((patch: Partial<OnboardingState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const complete = useCallback(() => {
    onDone(state.openedWorkspace ?? undefined);
  }, [onDone, state.openedWorkspace]);

  const next = useCallback(() => {
    if (index === STEPS.length - 1) complete();
    else setIndex((current) => current + 1);
  }, [complete, index]);

  const step = STEPS[index];
  const Step = step.Body;
  const stepProps: OnboardingStepProps = {
    state,
    update,
    next,
  };

  return (
    <main
      data-testid="first-run-onboarding"
      className="flex h-svh w-full flex-col overflow-hidden bg-background"
    >
      <div
        role="presentation"
        className="desktop-drag-area absolute inset-x-0 top-0 z-20 h-11"
      />
      <div className="relative flex min-h-full flex-col overflow-y-auto">
        <div className="relative aspect-[8/3] w-full shrink-0 overflow-hidden bg-neutral-950">
          {/* eslint-disable-next-line @next/next/no-img-element -- static same-origin asset; the Desktop CSP blocks the Next image optimizer */}
          <img
            src={step.artwork}
            alt=""
            aria-hidden
            width={1024}
            height={384}
            decoding="async"
            className="size-full object-cover"
          />
        </div>

        <div className="mx-auto flex min-h-96 w-full max-w-xl flex-1 flex-col px-8 py-7">
          <Step {...stepProps} />
        </div>
      </div>
    </main>
  );
}

function ChatGptStep({ next }: OnboardingStepProps) {
  const subscription = useChatGptSubscription();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = subscription.kind === "ready" ? subscription.status : null;
  const connected = status?.signed_in === true;
  const ready = status?.ready === true;
  const signingIn = busy || status?.signing_in === true;
  const accountLabel =
    status?.account?.email ??
    (status?.account?.plan
      ? `ChatGPT ${status.account.plan}`
      : connected
        ? "ChatGPT account"
        : null);
  const displayError =
    error ?? (subscription.kind === "error" ? subscription.message : null);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      if (connected) await chatgptSubscription.signOut();
      await chatgptSubscription.connect();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not sign in to ChatGPT."
      );
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setError(null);
    try {
      await chatgptSubscription.cancel();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not cancel ChatGPT sign-in."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="onboarding-step-chatgpt"
      className="flex min-h-full flex-1 flex-col gap-5"
    >
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">
          Connect ChatGPT
        </h1>
        <p className="text-sm text-muted-foreground">
          Use your existing ChatGPT subscription in Grida at no extra cost.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {subscription.kind === "loading" ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm"
          >
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            Checking your ChatGPT connection…
          </div>
        ) : ready ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <CheckIcon className="size-4" />
            </span>
            <div className="min-w-0 text-sm">
              <p className="font-medium text-foreground">ChatGPT connected</p>
              {accountLabel ? (
                <p className="truncate text-muted-foreground">{accountLabel}</p>
              ) : null}
            </div>
          </div>
        ) : signingIn ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm"
          >
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            Finish signing in in your browser.
          </div>
        ) : subscription.kind === "unsupported" ? (
          <p className="text-sm text-muted-foreground">
            ChatGPT sign-in is not available in this version of Grida Desktop.
          </p>
        ) : connected ? (
          <p className="text-sm text-muted-foreground">
            Reconnect ChatGPT to finish setting up your subscription.
          </p>
        ) : null}

        {displayError ? (
          <p className="text-sm text-destructive" role="alert">
            {displayError}
          </p>
        ) : null}
      </div>

      <div className="mt-auto flex flex-col items-center gap-1 pt-8">
        {subscription.kind === "loading" ? (
          <Button className="w-full max-w-64" disabled>
            <Loader2 className="size-4 animate-spin" />
            Continue with ChatGPT
          </Button>
        ) : ready ? (
          <Button className="w-full max-w-64" onClick={next}>
            Continue
          </Button>
        ) : signingIn ? (
          <Button
            variant="outline"
            className="w-full max-w-64"
            onClick={() => void cancel()}
          >
            Cancel sign-in
          </Button>
        ) : subscription.kind === "unsupported" ? null : connected ? (
          <Button className="w-full max-w-64" onClick={() => void connect()}>
            Reconnect ChatGPT
          </Button>
        ) : (
          <Button className="w-full max-w-64" onClick={() => void connect()}>
            <OpenAILogo aria-hidden="true" className="size-4" />
            Continue with ChatGPT
          </Button>
        )}
        {!connected ? (
          <Button
            variant="link"
            size="sm"
            className="text-muted-foreground"
            onClick={next}
          >
            Skip
          </Button>
        ) : null}
      </div>
    </div>
  );
}

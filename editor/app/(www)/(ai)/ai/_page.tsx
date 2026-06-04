"use client";

import React, { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { toast } from "sonner";
import { Loader2Icon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Response } from "@/components/ai-elements/response";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import models, { type ModelTier } from "@grida/ai-models";
import { cn } from "@/components/lib/utils";
import { resolveAiError } from "@/lib/ai/error";
import { AiCredits, useAiCredits } from "@/lib/ai/credits";
import { AI_GATE_FLOOR_CENTS, fmtUsd } from "@/lib/billing/fees";
import {
  runChat,
  type ChatTurn,
  type RunChatData,
} from "@/lib/ai/actions/chat";
import type { AiPageContext } from "./page";

type Props = {
  authed: boolean;
  context: AiPageContext | null;
};

const markdown = {
  className: "grida-ai-response-markdown space-y-2 text-sm leading-6",
  controls: {
    code: { copy: true, download: false },
    table: { copy: true, download: false, fullscreen: false },
  },
  plugins: { cjk, code, math, mermaid },
} as const;

// ---------------------------------------------------------------------------
// Model picker — only the four tiered models (nano / mini / pro / max),
// derived from the `@grida/ai-models` catalogue (`models.text.byTier`) so
// ids, labels, and pricing stay in lockstep with the source of truth.
// Non-tiered catalog entries (e.g. gpt-5.5, gpt-5.5-pro) are intentionally
// hidden — they're either too expensive for blanket exposure or reserved
// for specific call sites.
//
// `@grida/ai-models` is a pure data package; `@/lib/ai/models` is NOT
// imported here because it carries the server-only gateway/BYOK seam.
// ---------------------------------------------------------------------------
type ModelOption = {
  id: string;
  label: string;
  tier: ModelTier;
  inputUsd: number;
  outputUsd: number;
};
const TIER_ORDER = [
  "nano",
  "mini",
  "pro",
  "max",
] as const satisfies readonly ModelTier[];
const MODEL_OPTIONS: readonly ModelOption[] = TIER_ORDER.map((tier) => {
  const spec = models.text.byTier[tier];
  return {
    id: spec.id,
    label: spec.label,
    tier,
    inputUsd: spec.cost.input,
    outputUsd: spec.cost.output,
  };
});
const DEFAULT_MODEL_ID = models.text.byTier.mini.id;

// ---------------------------------------------------------------------------
// Debug flag — keyboard shortcut (Cmd/Ctrl+Shift+D) + `?debug=1` URL param.
// Persists across reloads via localStorage. There is no on-screen affordance
// to enable it; it's intentionally a hidden developer-mode toggle.
// ---------------------------------------------------------------------------
const DEBUG_STORAGE_KEY = "grida.ai.debug";

function useDebugFlag(): [boolean, () => void] {
  const [debug, setDebug] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("debug");
    if (fromUrl === "1") {
      localStorage.setItem(DEBUG_STORAGE_KEY, "1");
      setDebug(true);
      return;
    }
    if (fromUrl === "0") {
      localStorage.removeItem(DEBUG_STORAGE_KEY);
      setDebug(false);
      return;
    }
    setDebug(localStorage.getItem(DEBUG_STORAGE_KEY) === "1");
  }, []);

  const toggle = useCallback(() => {
    setDebug((cur) => {
      const next = !cur;
      if (next) localStorage.setItem(DEBUG_STORAGE_KEY, "1");
      else localStorage.removeItem(DEBUG_STORAGE_KEY);
      toast.message(next ? "Debug mode on" : "Debug mode off", {
        description: next
          ? "Model picker + per-call cost details are visible."
          : "Default product view restored.",
      });
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === "d" &&
        e.shiftKey &&
        (e.metaKey || e.ctrlKey)
      ) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return [debug, toggle];
}

function CreditChip({
  credits,
  billingHref,
  onRefresh,
  refreshing,
}: {
  credits: ReturnType<typeof useAiCredits>;
  billingHref: string | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  // BYOK bypasses billing for this AI-SDK chat surface only — no Grida
  // spend, so balance is moot here. GRIDA-SEC-003.
  if (credits.byok) {
    return (
      <Badge variant="outline" className="font-mono text-xs">
        BYOK
      </Badge>
    );
  }
  if (credits.cents === null || !billingHref) {
    return (
      <Badge variant="outline" className="font-mono text-xs">
        no balance
      </Badge>
    );
  }
  const lowBalance = credits.cents < AI_GATE_FLOOR_CENTS;
  return (
    <div className="flex items-center gap-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={billingHref}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono transition-colors",
                lowBalance
                  ? "border-amber-500/40 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {credits.formatted ?? "—"}
            </Link>
          </TooltipTrigger>
          <TooltipContent>
            <div className="font-mono text-xs">
              {credits.formattedExact ?? "—"}
            </div>
            <div className="text-[10px] opacity-70">
              live ·{" "}
              {lowBalance
                ? `below floor (${fmtUsd(AI_GATE_FLOOR_CENTS)}) — click to top up`
                : "click to manage billing"}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Refresh balance"
      >
        {refreshing ? (
          <Loader2Icon className="size-3 animate-spin" />
        ) : (
          <RefreshCwIcon className="size-3" />
        )}
      </Button>
    </div>
  );
}

export default function Page({ authed, context }: Props) {
  const credits = useAiCredits();
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [lastCall, setLastCall] = useState<{
    model_id: string;
    costMills: number;
    realCostUsd: number;
    usage: RunChatData["usage"];
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const [debug] = useDebugFlag();

  const organizationId = context?.organizationId;
  const billingHref = context
    ? `/organizations/${context.organizationSlug}/settings/billing`
    : null;
  const onRefresh = useCallback(() => {
    if (!organizationId) return;
    startRefresh(async () => {
      await credits.refresh();
    });
  }, [organizationId, credits]);

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const text = message.text?.trim();
      if (!text || pending) return;

      const next: ChatTurn[] = [...history, { role: "user", content: text }];
      setHistory(next);

      startTransition(async () => {
        const env = await runChat({
          organizationId,
          model_id: modelId,
          history,
          message: text,
        });

        const data = credits.consume(env, { next: "/ai" });
        if (data) {
          setHistory([...next, { role: "assistant", content: data.reply }]);
          setLastCall({
            model_id: data.model_id,
            costMills: data.costMills,
            realCostUsd: data.realCostUsd,
            usage: data.usage,
          });
          return;
        }

        // Failure — `consume` handled redirects; we own the toast UX
        // (bespoke `blocked` styling with a Top-up CTA). Roll back the
        // optimistic user turn so the prompt can be retried.
        setHistory((h) => h.slice(0, -1));
        if (env.success === false) {
          const action = resolveAiError(env, { next: "/ai" });
          if (action.kind === "toast") {
            if (env.code === "blocked" && billingHref) {
              toast.warning(action.message, {
                action: {
                  label: "Top up",
                  onClick: () => {
                    window.location.href = billingHref;
                  },
                },
              });
            } else {
              toast.error(action.message);
            }
          }
        }
      });
    },
    [history, organizationId, modelId, pending, billingHref, credits]
  );

  const selectedModel =
    MODEL_OPTIONS.find((m) => m.id === modelId) ?? MODEL_OPTIONS[1]!;

  return (
    <main className="flex h-screen flex-col">
      {/* ----- Header ------------------------------------------------------ */}
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex h-14 items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <SparklesIcon className="size-4 shrink-0" />
            <span className="text-sm font-medium">AI Chat</span>
          </div>

          <div className="flex items-center gap-2">
            <CreditChip
              credits={credits}
              billingHref={billingHref}
              onRefresh={onRefresh}
              refreshing={refreshing}
            />
          </div>
        </div>
      </header>

      {/* ----- Guest / no-org banner -------------------------------------- */}
      {(!authed || !context) && (
        <div className="border-b bg-muted/30">
          <div className="container mx-auto px-4 py-2.5 text-xs text-muted-foreground">
            {!authed ? (
              <>
                You&rsquo;re browsing as a guest. Sending a message will
                redirect you to sign-in.
              </>
            ) : (
              <>
                You&rsquo;re signed in but not in any organization. Sending a
                message will redirect you to onboarding.
              </>
            )}
          </div>
        </div>
      )}

      {/* ----- Conversation ----------------------------------------------- */}
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-4">
        <Conversation>
          <ConversationContent>
            {history.length === 0 && !pending ? (
              <ConversationEmptyState
                icon={<SparklesIcon className="size-6" />}
                title="Start a conversation"
                description="Ask anything. Each turn is billed at provider cost from your AI credit balance."
              />
            ) : (
              <>
                {history.map((turn, i) => (
                  <Message key={i} from={turn.role}>
                    <MessageContent>
                      {/* `mode="static"` is critical here. Streamdown's
                          default streaming mode wraps its block-state
                          update in `useTransition`; that transition
                          gets blocked by our outer chat transition,
                          leaving the bubble empty until the response
                          lands. Our backend returns complete strings
                          per call, so static rendering is correct. */}
                      <Response
                        className={
                          turn.role === "assistant"
                            ? markdown.className
                            : undefined
                        }
                        controls={
                          turn.role === "assistant"
                            ? markdown.controls
                            : undefined
                        }
                        mode="static"
                        plugins={markdown.plugins}
                      >
                        {turn.content}
                      </Response>
                    </MessageContent>
                  </Message>
                ))}
                {pending && (
                  <Message from="assistant">
                    <MessageContent>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2Icon className="size-4 animate-spin" />
                        Thinking…
                      </div>
                    </MessageContent>
                  </Message>
                )}
              </>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* ----- Last-call diagnostics (debug only) ----------------------- */}
        {debug && lastCall && (
          <div className="mt-2 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-muted/20 px-3 py-2 font-mono text-xs text-muted-foreground">
            <span title="Catalog model id used">
              <span className="opacity-60">model:</span> {lastCall.model_id}
            </span>
            <span title="What the provider actually charges us, un-rounded.">
              <span className="opacity-60">real:</span>{" "}
              {AiCredits.format.usd(lastCall.realCostUsd)}
            </span>
            <span title="Mills sent to Metronome (fractional — Stripe rounds at invoice).">
              <span className="opacity-60">metered:</span> {lastCall.costMills}m{" "}
              ({AiCredits.format.usd(lastCall.costMills / 1000)})
            </span>
            {lastCall.realCostUsd > 0 && (
              <span title="Rounding margin: (metered − real) / real. Should be ~0 once fractional mills are enabled.">
                <span className="opacity-60">Δ:</span> +
                {(
                  (lastCall.costMills / 1000 / lastCall.realCostUsd - 1) *
                  100
                ).toFixed(0)}
                %
              </span>
            )}
            <span title="Token usage as reported by the provider.">
              <span className="opacity-60">tokens:</span>{" "}
              {lastCall.usage.inputTokens}in / {lastCall.usage.outputTokens}out
              {lastCall.usage.cacheReadTokens
                ? ` / ${lastCall.usage.cacheReadTokens}cache`
                : ""}
            </span>
          </div>
        )}

        {/* ----- Prompt input ------------------------------------------- */}
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="Ask anything…"
              disabled={pending}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <Select value={modelId} onValueChange={setModelId}>
                <SelectTrigger className="h-8 w-min border-none text-xs">
                  <SelectValue>{selectedModel.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      <span className="flex items-center gap-2">
                        <span>{m.label}</span>
                        {m.tier && (
                          <Badge
                            variant="secondary"
                            className="px-1 text-[10px]"
                          >
                            {m.tier}
                          </Badge>
                        )}
                        {debug && (
                          <span className="font-mono text-muted-foreground">
                            ${m.inputUsd}/${m.outputUsd} per 1M
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PromptInputTools>
            <PromptInputSubmit
              disabled={pending}
              status={pending ? "submitted" : undefined}
            />
          </PromptInputFooter>
        </PromptInput>

        {context &&
          !credits.byok &&
          !credits.allowed &&
          credits.cents !== null &&
          billingHref && (
            <p className="mt-2 text-xs text-muted-foreground">
              Your AI balance is below the {fmtUsd(AI_GATE_FLOOR_CENTS)} floor —
              calls will be blocked.{" "}
              <Link href={billingHref} className="underline">
                Top up
              </Link>
              .
            </p>
          )}
      </div>
    </main>
  );
}

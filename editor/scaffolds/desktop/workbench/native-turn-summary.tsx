import { useCallback, useState } from "react";
import { Button } from "@app/ui/components/button";
import type {
  NativeChatArtifactSaveResult,
  NativeChatGatewayAttemptRef,
  NativeChatGatewayBillingAttempts,
  NativeChatImageArtifact,
  NativeChatMessage,
  NativeChatTokenCategory,
  NativeChatTokenUsage,
  NativeChatTurnSummary,
} from "@grida/desktop-bridge";
import type {
  NativeChatController,
  NativeChatView,
} from "@/lib/agent-chat/native-chat-controller";
import { FullscreenImagePreview } from "@/kits/image-preview";

const CHECK_LABEL: Record<NativeChatTurnSummary["checks"][number], string> = {
  allowed: "passed",
  denied: "denied",
  failed: "failed",
  cancelled: "cancelled",
  uncertain: "uncertain",
  invalid_reply: "invalid response",
  unavailable: "unavailable",
  deferred: "deferred",
  skipped: "skipped",
};

const TOKEN_LABEL: Record<NativeChatTokenCategory, string> = {
  input: "Input",
  output: "Output",
  uncached_input: "Uncached input",
  cached_input: "Cached input",
  cache_creation_input: "Cache creation input",
  tool_input: "Tool input",
  reasoning_output: "Reasoning output",
};

const TOKEN_FORMAT = new Intl.NumberFormat();

export function NativeTurnSummary({
  summary,
  messages,
  previewController,
  onRetry,
  billingRefresh,
  onRefreshGatewayBilling,
}: {
  summary: NativeChatTurnSummary;
  messages: readonly NativeChatMessage[];
  previewController?: NativeChatController;
  onRetry?: () => void;
  billingRefresh?: NativeChatView["gatewayBillingRefresh"];
  onRefreshGatewayBilling?: (
    turnId: string,
    attempt: NativeChatGatewayAttemptRef
  ) => void;
}) {
  const text = summary.text.trim();
  const inTranscript = messages.some(
    (message) =>
      message.role === "assistant" &&
      (message.text.trim() === text ||
        (summary.textTruncated && message.text.trimStart().startsWith(text)))
  );
  const details = [
    (summary.steps ?? 0) > 1 && `${summary.steps} inference steps`,
    summary.toolActivity?.succeeded &&
      `Tools completed: ${summary.toolActivity.succeeded}`,
    summary.toolActivity?.failed &&
      `Tools failed: ${summary.toolActivity.failed}`,
    summary.toolActivity?.cancelled &&
      `Tools cancelled: ${summary.toolActivity.cancelled}`,
    summary.toolActivity?.unresolved &&
      `Tools unresolved: ${summary.toolActivity.unresolved}`,
    summary.unresolvedOperations &&
      `Unresolved operations: ${summary.unresolvedOperations}`,
    summary.reviewFindingsCollected !== undefined &&
      (summary.reviewFindingsCollected
        ? "Independent review findings collected"
        : "Independent review findings were not collected"),
    summary.artifactsOmitted &&
      `Recorded artifacts not listed: ${summary.artifactsOmitted}`,
  ].filter(Boolean);
  const showText =
    !!text &&
    (onRetry ||
      (!inTranscript &&
        (summary.status !== "succeeded" || text !== "The turn finished.")));
  const artifacts = previewController ? summary.artifacts : undefined;
  if (
    !showText &&
    !details.length &&
    !summary.checks.length &&
    !summary.tokenUsage &&
    !summary.gatewayBilling &&
    !artifacts?.length
  )
    return null;

  const refreshBilling =
    onRefreshGatewayBilling &&
    ((attempt: NativeChatGatewayAttemptRef) =>
      onRefreshGatewayBilling(summary.turnId, attempt));

  return (
    <details className="rounded-md border px-3 py-2 text-xs">
      <summary className="cursor-pointer text-muted-foreground">
        Turn summary
      </summary>
      {showText && (
        <p className="mt-2 whitespace-pre-wrap break-words">
          {text}
          {summary.textTruncated && " (excerpt)"}
        </p>
      )}
      {onRetry && (
        <div className="mt-2 flex items-center gap-2 text-muted-foreground">
          <span>Summary details are unavailable.</span>
          <Button type="button" variant="ghost" size="xs" onClick={onRetry}>
            Retry summary
          </Button>
        </div>
      )}
      {details.length > 0 && (
        <p className="mt-2 text-muted-foreground">{details.join(" · ")}</p>
      )}
      {summary.checks.length > 0 && (
        <p className="mt-2 text-muted-foreground">
          Completion checks:{" "}
          {summary.checks.map((status) => CHECK_LABEL[status]).join(", ")}
        </p>
      )}
      {summary.tokenUsage && <TokenUsage usage={summary.tokenUsage} />}
      {summary.gatewayBilling && (
        <>
          <GatewayBilling
            heading="Gateway billing for this turn"
            billing={summary.gatewayBilling}
            refresh={billingRefresh}
            onRefresh={refreshBilling}
          />
          {summary.gatewayBilling.review && (
            <GatewayBilling
              heading="Gateway billing for the independent review"
              billing={summary.gatewayBilling.review}
              refresh={billingRefresh}
              onRefresh={refreshBilling}
            />
          )}
        </>
      )}
      {previewController && artifacts && artifacts.length > 0 && (
        <ul className="mt-2 space-y-1">
          {artifacts.map((artifact) => (
            <li key={artifact.id}>
              <CropPreview
                artifact={artifact}
                controller={previewController}
                turnId={summary.turnId}
              />
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function TokenUsage({ usage }: { usage: NativeChatTokenUsage }) {
  const { reported, attemptsWithoutCounts } = usage;
  return (
    <div className="mt-2 text-muted-foreground">
      <p>Provider-reported tokens</p>
      {reported.length > 0 && (
        <p>
          {reported
            .map(
              ({ category, tokens, partial }) =>
                `${TOKEN_LABEL[category]} ${TOKEN_FORMAT.format(BigInt(tokens))}${
                  partial ? " (partial)" : ""
                }`
            )
            .join(" · ")}
        </p>
      )}
      {attemptsWithoutCounts > 0 && (
        <p>
          Token counts unknown for {attemptsWithoutCounts}{" "}
          {attemptsWithoutCounts === 1 ? "model request" : "model requests"}.
        </p>
      )}
    </div>
  );
}

function GatewayBilling({
  heading,
  billing,
  refresh,
  onRefresh,
}: {
  heading: string;
  billing: NativeChatGatewayBillingAttempts;
  refresh?: NativeChatView["gatewayBillingRefresh"];
  onRefresh?: (attempt: NativeChatGatewayAttemptRef) => void;
}) {
  if (!billing.attempts.length && !billing.omittedAttempts) return null;
  return (
    <div className="mt-2 text-muted-foreground">
      <p>{heading}</p>
      <ul>
        {billing.attempts.map((attempt, index) => {
          const status =
            refresh?.operationId === attempt.operationId &&
            refresh.attemptId === attempt.attemptId
              ? refresh.status
              : undefined;
          const amount =
            attempt.kind === "settled"
              ? `${attempt.chargedMills} mills charged`
              : attempt.kind === "pending"
                ? "Settlement pending"
                : "Amount unavailable";
          return (
            <li
              key={JSON.stringify([attempt.operationId, attempt.attemptId])}
              className="flex flex-wrap items-center gap-x-2"
            >
              <span>
                Model request {index + 1} · {amount}
              </span>
              {onRefresh && attempt.refreshable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={refresh?.status === "loading"}
                  onClick={() => onRefresh(attempt)}
                >
                  {status === "loading" ? "Refreshing…" : "Refresh billing"}
                </Button>
              )}
              {status === "unavailable" && (
                <span role="status">Couldn't refresh billing.</span>
              )}
            </li>
          );
        })}
      </ul>
      {billing.omittedAttempts > 0 && (
        <p>Additional Gateway requests: {billing.omittedAttempts}</p>
      )}
    </div>
  );
}

function CropPreview({
  artifact,
  controller,
  turnId,
}: {
  artifact: NativeChatImageArtifact;
  controller: NativeChatController;
  turnId: string;
}) {
  const load = useCallback(
    () => controller.readTurnArtifact(turnId, artifact.id),
    [controller, turnId, artifact.id]
  );
  const [saveStatus, setSaveStatus] = useState<
    NativeChatArtifactSaveResult | "saving" | "unavailable" | null
  >(null);
  const save = async () => {
    setSaveStatus("saving");
    try {
      setSaveStatus(await controller.saveTurnArtifact(turnId, artifact.id));
    } catch {
      setSaveStatus("unavailable");
    }
  };
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <FullscreenImagePreview
        loadImage={load}
        alt={artifact.label}
        downloadName="cropped.png"
        className="cursor-pointer underline underline-offset-2"
      >
        Preview cropped PNG ({artifact.width} × {artifact.height})
      </FullscreenImagePreview>
      {controller.canSaveTurnArtifact && (
        <button
          type="button"
          className="cursor-pointer underline underline-offset-2 disabled:opacity-50"
          disabled={saveStatus === "saving"}
          onClick={() => void save()}
        >
          {saveStatus === "failed" ? "Retry save" : "Save PNG as…"}
        </button>
      )}
      {saveStatus === "saving" && <span role="status">Saving…</span>}
      {saveStatus === "saved" && <span role="status">Saved a copy.</span>}
      {saveStatus === "failed" && (
        <span role="status">
          Couldn’t save a copy. The crop is still in this chat. Choose a new
          file to retry.
        </span>
      )}
      {saveStatus === "unavailable" && (
        <span role="status">This crop is unavailable to save.</span>
      )}
    </div>
  );
}

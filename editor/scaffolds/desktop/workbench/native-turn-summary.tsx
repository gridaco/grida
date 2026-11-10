import { useCallback, useState } from "react";
import type {
  NativeChatArtifactSaveResult,
  NativeChatImageArtifact,
  NativeChatMessage,
  NativeChatTokenCategory,
  NativeChatTokenUsage,
  NativeChatTurnSummary,
} from "@grida/desktop-bridge";
import type { NativeChatController } from "@/lib/agent-chat/native-chat-controller";
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
}: {
  summary: NativeChatTurnSummary;
  messages: readonly NativeChatMessage[];
  previewController?: NativeChatController;
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
  ].filter(Boolean);
  const showText =
    !!text &&
    !inTranscript &&
    (summary.status !== "succeeded" || text !== "The turn finished.");
  const artifacts = previewController ? summary.artifacts : undefined;
  if (
    !showText &&
    !details.length &&
    !summary.checks.length &&
    !summary.tokenUsage &&
    !artifacts?.length
  )
    return null;

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

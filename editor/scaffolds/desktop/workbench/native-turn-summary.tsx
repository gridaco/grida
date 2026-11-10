import { useCallback } from "react";
import type {
  NativeChatImageArtifact,
  NativeChatMessage,
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
  return (
    <FullscreenImagePreview
      loadImage={load}
      alt={artifact.label}
      downloadName="cropped.png"
      className="cursor-pointer underline underline-offset-2"
    >
      Preview cropped PNG ({artifact.width} × {artifact.height})
    </FullscreenImagePreview>
  );
}

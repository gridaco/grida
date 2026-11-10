import type {
  NativeChatMessage,
  NativeChatTurnSummary,
} from "@grida/desktop-bridge";

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
}: {
  summary: NativeChatTurnSummary;
  messages: readonly NativeChatMessage[];
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
  if (!showText && !details.length && !summary.checks.length) return null;

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
    </details>
  );
}

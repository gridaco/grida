/** Safe diagnostics for retained best-effort submission effects. */
export namespace SubmissionDiagnostics {
  export type Stage =
    | "customer_enrichment"
    | "response_fields_write"
    | "file_upload"
    | "connected_file_update"
    | "response_file_write"
    | "response_read"
    | "staged_file_move"
    | "file_size_rejected"
    | "connected_file_commit"
    | "staged_file_commit";

  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // The HTTP middleware replaces caller-supplied IDs before domain dispatch.
  // Validate again so direct callers cannot put arbitrary text into logs.
  export function warning(stage: Stage, requestId?: string | null) {
    console.warn(
      JSON.stringify({
        event: "forms_best_effort_failure",
        stage,
        ...(requestId && uuid.test(requestId) ? { request_id: requestId } : {}),
      })
    );
  }
}

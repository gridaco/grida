// GRIDA-SEC-004 — the private client sends only an exact, confirmed retirement.

export type NativeSavedChatDeletion = Readonly<{
  sessionId: string;
  cwd: string;
  requestId: string;
  expectedSessionRevision: number;
  expectedCatalogRevision: number;
}>;

const UNVERIFIED = "native_chat_deletion_unverified";
const RETRYABLE_RECEIPT = new Set([
  "native_agent_request_timeout",
  "sqlite_commit_unconfirmed",
  "session_deletion_unverified",
]);
const UNVERIFIED_RECEIPT = new Set([
  UNVERIFIED,
  ...RETRYABLE_RECEIPT,
  "native_agent_disconnected",
  "native_agent_input_failed",
  "native_agent_output_failed",
  "native_agent_invalid_response",
  "native_agent_request_failed",
  "store_task_interrupted",
  "control_worker_interrupted",
]);

export class NativeAgentDeletion {
  static readonly capability = "co.grida/session/delete";

  constructor(
    private readonly request: (
      method: string,
      params: NativeSavedChatDeletion
    ) => Promise<unknown>
  ) {}

  static isUnverified(error: unknown): boolean {
    return error instanceof Error && UNVERIFIED_RECEIPT.has(error.message);
  }

  async retire(deletion: NativeSavedChatDeletion): Promise<void> {
    const request = Object.freeze({ ...deletion });
    try {
      await this.verifyReceipt(request);
    } catch (error) {
      if (!(error instanceof Error) || !RETRYABLE_RECEIPT.has(error.message))
        throw error;
      try {
        await this.verifyReceipt(request);
      } catch (cause) {
        // A refusal of the replay cannot settle an earlier unobserved request.
        throw new Error(UNVERIFIED, { cause });
      }
    }
  }

  private async verifyReceipt(request: NativeSavedChatDeletion): Promise<void> {
    const response = await this.request(
      `_${NativeAgentDeletion.capability}`,
      request
    );
    if (!response || typeof response !== "object" || Array.isArray(response))
      throw new Error(UNVERIFIED);
    const receipt = response as Record<string, unknown>;
    if (
      Object.keys(receipt).length !== 2 ||
      receipt.sessionId !== request.sessionId ||
      receipt.requestId !== request.requestId
    )
      throw new Error(UNVERIFIED);
  }
}

// GRIDA-SEC-004 — the private client sends only an exact, confirmed retirement.

export type NativeSavedChatDeletion = Readonly<{
  sessionId: string;
  cwd: string;
  requestId: string;
  expectedSessionRevision: number;
  expectedCatalogRevision: number;
  expectedOwnedChildren?: readonly number[];
}>;

type Target = Pick<NativeSavedChatDeletion, "sessionId" | "cwd">;

export type NativeSavedChatDeletionPreview = Readonly<{
  ownedChildren: number;
  ownedChildrenBasis: readonly number[];
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
  static readonly previewCapability = "co.grida/session/delete-preview";

  constructor(
    private readonly request: (
      method: string,
      params: Target
    ) => Promise<unknown>
  ) {}

  static isUnverified(error: unknown): boolean {
    return error instanceof Error && UNVERIFIED_RECEIPT.has(error.message);
  }

  async preview({
    sessionId: expectedSession,
    cwd,
  }: Target): Promise<NativeSavedChatDeletionPreview> {
    const invalid = () => new Error("native_chat_deletion_preview_invalid");
    const response = await this.request(
      `_${NativeAgentDeletion.previewCapability}`,
      { sessionId: expectedSession, cwd }
    );
    if (!response || typeof response !== "object" || Array.isArray(response))
      throw invalid();
    const { sessionId, ownedChildren, ownedChildrenBasis } = response as Record<
      string,
      unknown
    >;
    if (
      Object.keys(response).length !== 3 ||
      sessionId !== expectedSession ||
      typeof ownedChildren !== "number" ||
      !Number.isInteger(ownedChildren) ||
      ownedChildren < 0 ||
      ownedChildren > 128 ||
      !Array.isArray(ownedChildrenBasis) ||
      ownedChildrenBasis.length !== 32
    )
      throw invalid();
    const basis = [...ownedChildrenBasis];
    if (basis.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255))
      throw invalid();
    return Object.freeze({
      ownedChildren,
      ownedChildrenBasis: Object.freeze(basis),
    });
  }

  async retire(deletion: NativeSavedChatDeletion): Promise<void> {
    const { expectedOwnedChildren } = deletion;
    const request = Object.freeze({
      ...deletion,
      ...(expectedOwnedChildren && {
        expectedOwnedChildren: Object.freeze([...expectedOwnedChildren]),
      }),
    });
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

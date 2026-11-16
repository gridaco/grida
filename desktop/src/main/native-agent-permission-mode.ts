// GRIDA-SEC-004 / GRIDA-SEC-014 — native host owns captured permission authority.
import type {
  NativeChatPermissionMode,
  NativeChatPermissionState,
} from "@grida/desktop-bridge";

/** Secret-free, negotiated private-native permission selection. */
export class NativeAgentPermissionModes {
  static readonly capability = "co.grida/session/permission-mode";

  constructor(
    private readonly request: (
      method: string,
      input: unknown
    ) => Promise<unknown>,
    private readonly cwd: string
  ) {}

  async inspect(sessionId: string): Promise<NativeChatPermissionState> {
    return this.read(
      await this.request(`_${NativeAgentPermissionModes.capability}`, {
        cwd: this.cwd,
        sessionId,
      }),
      sessionId
    );
  }

  async update(
    sessionId: string,
    expectedRevision: number,
    requestId: string,
    mode: NativeChatPermissionMode
  ): Promise<NativeChatPermissionState> {
    const value = await this.request(
      `_${NativeAgentPermissionModes.capability}/update`,
      { cwd: this.cwd, sessionId, expectedRevision, requestId, mode }
    );
    if (
      !value ||
      typeof value !== "object" ||
      !("requestId" in value) ||
      value.requestId !== requestId
    )
      throw new Error("native_chat_permission_mode_invalid_response");
    const state = this.read(value, sessionId);
    if (state.mode !== mode)
      throw new Error("native_chat_permission_mode_invalid_response");
    // The native current state remains durable. Releasing this coordination
    // receipt cannot turn a committed choice into a failed UI operation.
    await this.request(`_${NativeAgentPermissionModes.capability}/ack`, {
      cwd: this.cwd,
      sessionId,
      requestId,
    }).catch(() => {});
    return state;
  }

  private read(value: unknown, sessionId: string): NativeChatPermissionState {
    const result = value as Partial<NativeChatPermissionState> | null;
    if (
      !result ||
      result.sessionId !== sessionId ||
      !Number.isSafeInteger(result.revision) ||
      result.revision! < 0 ||
      !validMode(result.mode) ||
      !Array.isArray(result.available) ||
      result.available.length < 1 ||
      result.available.length > 2 ||
      !result.available.every(validMode) ||
      new Set(result.available).size !== result.available.length ||
      !result.available.includes(result.mode)
    )
      throw new Error("native_chat_permission_mode_invalid_response");
    return {
      sessionId,
      revision: result.revision!,
      mode: result.mode,
      available: [...result.available],
    };
  }
}

function validMode(value: unknown): value is NativeChatPermissionMode {
  return value === "restricted" || value === "full_access";
}

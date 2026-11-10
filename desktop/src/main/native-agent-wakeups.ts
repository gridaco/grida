// GRIDA-SEC-004 — validated projection of one attached task's retained timer.
import type {
  NativeChatSnapshot,
  NativeChatWakeup,
} from "@grida/desktop-bridge";

const LIST = "co.grida/session/wakeups";
const CANCEL = "co.grida/session/cancel-wakeup";
const RECOVER = "co.grida/session/recover-wakeup";
const CONTINUE = "co.grida/session/continue-cancelled-wakeup";
const WAIT_ID = /^[A-Za-z0-9_.:@/-]{1,256}$/;
const MAX_DATE_MS = 8_640_000_000_000_000;

export class NativeAgentWakeups {
  static readonly capabilities = {
    [LIST]: 1,
    [CANCEL]: 1,
    [RECOVER]: 1,
    [CONTINUE]: 1,
  } as const;
  static readonly methods = {
    read: `_${LIST}`,
    cancel: `_${CANCEL}`,
    recover: `_${RECOVER}`,
  };

  static turn(snapshot: NativeChatSnapshot) {
    return snapshot.current ?? snapshot.latest;
  }

  static decode(
    response: unknown,
    sessionId: string,
    turnId: string
  ): NativeChatWakeup | null {
    const reply = record(response);
    if (reply.sessionId !== sessionId || reply.turnId !== turnId)
      throw invalid();
    if (reply.wakeup === null) return null;
    const { waitId, dueAtMs, reason, status, armed } = record(reply.wakeup);
    if (
      typeof waitId !== "string" ||
      !WAIT_ID.test(waitId) ||
      typeof dueAtMs !== "number" ||
      !Number.isSafeInteger(dueAtMs) ||
      dueAtMs <= 0 ||
      dueAtMs > MAX_DATE_MS ||
      typeof reason !== "string" ||
      !reason.trim() ||
      Buffer.byteLength(reason) > 256 ||
      typeof armed !== "boolean" ||
      (status !== "waiting" &&
        status !== "paused" &&
        status !== "delivered" &&
        status !== "cancelled" &&
        status !== "stopped")
    )
      throw invalid();
    return Object.freeze({ turnId, waitId, dueAtMs, reason, status, armed });
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}

function invalid(): Error {
  return new Error("native_chat_wakeup_invalid");
}

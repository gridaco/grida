/**
 * GRIDA-GG: error detection — the renderer half of the gateway's typed-error
 * contract, in a bridge-free module.
 *
 * The daemon's typed errors cross Electron's contextBridge, which strips
 * custom props; the LITERAL CODE leads the message (the `isWriteConflict`
 * idiom), so detection is by substring — these literals ARE the wire
 * contract (see the agent package's `run-agent.ts` onError). Kept free of
 * bridge/React imports so both `gg-session.ts` (the session custodian) and
 * `agent-chat/chat-error.ts` (the banner classifier, Node-tested) share ONE
 * implementation instead of drifting copies.
 */

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : JSON.stringify(err ?? "");
}

export function isGgTokenExpired(err: unknown): boolean {
  return errorText(err).includes("gg_token_expired");
}

export function isGgInsufficientCredits(err: unknown): boolean {
  return errorText(err).includes("insufficient_credits");
}

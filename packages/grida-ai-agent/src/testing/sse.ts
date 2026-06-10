/**
 * Test-only SSE helpers shared across the package's suites. Not part of
 * any published entrypoint — imported by `*.test.ts` files only.
 */

import { GRIDA_SESSION_SSE_EVENT } from "../protocol/run";

/**
 * Session continuity rides the in-band `grida-session` SSE frame (the
 * sole channel — no response header). Pull the session id out of a
 * drained SSE body; empty string when the frame is absent or malformed.
 */
export function sessionIdFromSse(body: string): string {
  for (const frame of body.split("\n\n")) {
    if (!frame.startsWith(`event: ${GRIDA_SESSION_SSE_EVENT}`)) continue;
    const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
    if (!dataLine) continue;
    try {
      const parsed = JSON.parse(dataLine.slice("data:".length).trim()) as {
        session_id?: string;
      };
      return parsed.session_id ?? "";
    } catch {
      return "";
    }
  }
  return "";
}

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

/**
 * Concatenate the assistant's visible text from a drained SSE body — every
 * `text-delta` UIMessageChunk's `delta`, in order. Non-JSON / non-text frames
 * (the `grida-session` frame, `[DONE]`) are skipped. The shared assertion
 * helper for live run suites.
 */
export function assistantTextFromSse(body: string): string {
  let text = "";
  for (const frame of body.split("\n\n")) {
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice("data:".length).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const obj = JSON.parse(payload) as { type?: string; delta?: string };
        if (obj.type === "text-delta" && typeof obj.delta === "string") {
          text += obj.delta;
        }
      } catch {
        /* not a JSON UIMessageChunk frame (e.g. the session frame) */
      }
    }
  }
  return text;
}

/** All `start` chunk messageIds in a drained SSE body, in order — the
 * message-identity probe (a resume must re-advertise the paused turn's id). */
export function startIdsOf(sse: string): string[] {
  return [...sse.matchAll(/"type":"start","messageId":"([^"]+)"/g)].map(
    (m) => m[1]!
  );
}

/** Parse an agent SSE body into UI-message chunk objects (skips the
 * `grida-session` continuity frame and the `[DONE]` sentinel). */
export function chunksOf(sse: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const frame of sse.split("\n\n")) {
    if (frame.includes("event:")) continue;
    const data = frame
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") continue;
    try {
      out.push(JSON.parse(data));
    } catch {
      // non-JSON frame — not a chunk
    }
  }
  return out;
}

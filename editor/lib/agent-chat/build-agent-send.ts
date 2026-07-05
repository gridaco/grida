/**
 * `buildAgentSend` — the single place the desktop agent surfaces turn a
 * `(text, files?)` submit into a `useChat` `sendMessage` call with the run body.
 *
 * Both surfaces (the workspace `agent-pane.tsx` and the standalone-doc
 * `ai-sidebar/chat.tsx`) had near-identical inline send closures. Centralizing
 * it keeps the two in lockstep and is the one spot that threads inline image
 * `files` (perceive-only `file` parts) onto the message. (Skills are no longer
 * per-send: the agent discovers them from disk and advertises them itself.)
 */

import type { FileUIPart } from "ai";
import type { AgentMode } from "@grida/agent";

/** The body the desktop agent routes read off each send. */
export type AgentSendBody = {
  session_id?: string;
  model_id: string;
  /**
   * Explicit provider pick (issue #806). Set when the chosen model is a
   * registered endpoint model — provider resolution otherwise cascades
   * BYOK-first, and a stored OpenRouter key would swallow a local model
   * id it cannot serve. Omitted for catalog models (cascade is correct).
   */
  provider_id?: string;
  /** Permission/supervision posture for the turn (RFC `permission modes`). */
  mode?: AgentMode;
};

/** Minimal `useChat` `sendMessage` surface this helper needs. */
export type SendMessageFn = (
  message: { text: string; files?: FileUIPart[] },
  options?: { body?: AgentSendBody }
) => void | Promise<void>;

export function buildAgentSend(opts: {
  sendMessage: SendMessageFn;
  sessionId: string | null;
  modelId: string;
  /** Endpoint provider id serving `modelId`, when it's a registered model. */
  providerId?: string;
  mode?: AgentMode;
}): (text: string, files?: FileUIPart[]) => void {
  const { sendMessage, sessionId, modelId, providerId, mode } = opts;
  return (text, files) => {
    const body: AgentSendBody = {
      session_id: sessionId ?? undefined,
      model_id: modelId,
    };
    if (providerId) body.provider_id = providerId;
    if (mode) body.mode = mode;
    void sendMessage(files && files.length > 0 ? { text, files } : { text }, {
      body,
    });
  };
}

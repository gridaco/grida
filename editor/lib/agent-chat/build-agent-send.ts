/**
 * `buildAgentSend` — the single place the desktop agent surfaces turn a
 * `(text, files?)` submit into a `useChat` `sendMessage` call with the run body.
 *
 * Both surfaces (the workspace `agent-pane.tsx` and the standalone-doc
 * `ai-sidebar/chat.tsx`) had near-identical inline send closures; they differ
 * only in whether a per-tab `skills` subset rides along. Centralizing it keeps
 * the two in lockstep and is the one spot that threads inline image `files`
 * (perceive-only `file` parts) onto the message.
 */

import type { FileUIPart } from "ai";

/** The body the desktop agent routes read off each send. */
export type AgentSendBody = {
  session_id?: string;
  model_id: string;
  /** Per-send skill subset (workspace tab); omitted on tab-less surfaces. */
  skills?: string[];
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
  skills?: string[];
}): (text: string, files?: FileUIPart[]) => void {
  const { sendMessage, sessionId, modelId, skills } = opts;
  return (text, files) => {
    const body: AgentSendBody = {
      session_id: sessionId ?? undefined,
      model_id: modelId,
    };
    if (skills) body.skills = skills;
    void sendMessage(files && files.length > 0 ? { text, files } : { text }, {
      body,
    });
  };
}

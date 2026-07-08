/**
 * `buildAgentSend` — the single place the desktop agent surfaces turn a
 * `(text, files?)` submit into a `useChat` `sendMessage` call with the run body.
 *
 * Both surfaces (the workspace `agent-pane.tsx` and the standalone-doc
 * `ai-sidebar/chat.tsx`) had near-identical inline send closures. Centralizing
 * it keeps the two in lockstep and is the one spot that threads inline image
 * `files` (perceive-only `file` parts) AND registered context token parts (a
 * picked template, …) onto the message. (Skills are no longer per-send: the
 * agent discovers them from disk and advertises them itself.)
 */

import type { FileUIPart } from "ai";
import { USER_TEMPLATE_SELECTION, type AgentMode } from "@grida/agent";

/**
 * A registered context token part (WG `compositor.md` §"Templating: user view vs
 * model view") — an AI-SDK-native `data-*` part the host contributes on the
 * user's behalf. Rides the outgoing message's `parts`; the daemon lowers it to a
 * `<marker>` block (model view) and the chat renders it as a chip (user view), so
 * the user's `text` part is never fabricated. `type` is a `data-*` token from
 * `CONTEXT_MARKERS`; `data` is the token's lean payload.
 */
export type ContextPart = { type: string; data: Record<string, unknown> };

/** Metadata for a picked slides template — the producer input for a
 *  {@link USER_TEMPLATE_SELECTION} context part ({@link buildTemplateContext}). */
export type TemplateContextMeta = {
  title: string;
  slides: number;
  system?: string;
};

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
  /**
   * Files to seed into the session's scratch dir before the model turn (WG
   * `scratch.md`) — a picked template's unzipped bundle / an upload lands there
   * (agent-only), NOT the workspace. First turn only; the daemon bounds + writes
   * them via `writeScratchFile`.
   */
  scratch_seed?: { path: string; text: string }[];
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
  /**
   * Files to seed into the session scratch on the FIRST turn (WG `scratch.md`) —
   * e.g. a picked slides template's unzipped bundle. Set only for the handoff's
   * first send; carried on every `send` this closure makes, so pass a fresh
   * `buildAgentSend` (or omit it) once the seed turn has fired.
   */
  scratchSeed?: { path: string; text: string }[];
  /**
   * Registered context token parts (e.g. a {@link USER_TEMPLATE_SELECTION}) to
   * attach to the message's `parts` — first turn only, gated like `scratchSeed`.
   * Present ⇒ the send uses the `{role, parts}` message form so the token rides
   * ALONGSIDE the honest user `text` (never fabricated into it).
   */
  contexts?: ContextPart[];
}): (text: string, files?: FileUIPart[]) => void {
  const {
    sendMessage,
    sessionId,
    modelId,
    providerId,
    mode,
    scratchSeed,
    contexts,
  } = opts;
  return (text, files) => {
    const body: AgentSendBody = {
      session_id: sessionId ?? undefined,
      model_id: modelId,
    };
    if (providerId) body.provider_id = providerId;
    if (mode) body.mode = mode;
    if (scratchSeed && scratchSeed.length > 0) body.scratch_seed = scratchSeed;
    if (contexts && contexts.length > 0) {
      // Attach context tokens (a picked template, …) as sibling `parts` next to
      // the honest user `text` — the `{role, parts}` arm of useChat().sendMessage.
      // `as never`: our local SendMessageFn types only the `{text, files}` arm;
      // the real `sendMessage` handles `{role, parts}` at runtime, and the
      // `data-*` context parts survive the wire via `normalizeWireParts` (WG
      // compositor.md §templating). Text + images ride as native parts here too.
      const parts = [
        ...(text ? [{ type: "text", text }] : []),
        ...(files ?? []),
        ...contexts,
      ];
      void sendMessage({ role: "user", parts } as never, { body });
      return;
    }
    void sendMessage(files && files.length > 0 ? { text, files } : { text }, {
      body,
    });
  };
}

/**
 * Build the {@link USER_TEMPLATE_SELECTION} context part from a picked template's
 * metadata (or `[]` when none). LEAN payload — facts only (`title`, `slides`,
 * `system?`, `bundle_location`); the `slides` skill owns "how to use a template",
 * and the deck's unzipped `.canvas` bundle rides `scratch_seed` into scratch. The
 * agent-pane threads the result into {@link buildAgentSend}'s `contexts` on the
 * first (auto-sent) turn.
 */
export function buildTemplateContext(
  meta: TemplateContextMeta | undefined
): ContextPart[] {
  if (!meta) return [];
  return [
    {
      type: USER_TEMPLATE_SELECTION,
      data: {
        title: meta.title,
        slides: meta.slides,
        ...(meta.system ? { system: meta.system } : {}),
        bundle_location: "scratch",
      },
    },
  ];
}

/**
 * Owned wire vocabulary for the Grida agent.
 *
 * The shipped HTTP stream contract is the AI SDK `UIMessageChunk` alias
 * exported below. Grida-owned stream frames can be introduced later only with
 * an encoder/decoder pair and contract tests.
 */

/** AI-SDK UI-message chunk — the transport frame the agent streams. */
export type { UIMessageChunk as AgentUIMessageChunk } from "ai";

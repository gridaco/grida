/**
 * `@grida/agent/acp` — Grida as an ACP agent (docs/wg/ai/agent/acp.md).
 * The adapter is a pure translator over the one HTTP contract; the stdio
 * runner connects the adapter to a host process's input and output.
 */
export {
  AcpAgentAdapter,
  promptText,
  toolKind,
  translateChunk,
  type AcpAgentAdapterOptions,
  type AcpCoreClient,
  type AcpUpdateSink,
} from "./adapter";
export { runAcpStdio, type AcpStdioHandle } from "./stdio";

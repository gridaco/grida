/**
 * `@grida/agent-tools` — storage-agnostic runtime primitives for Grida AI agents.
 *
 * Two top-level symbols, each a class with a same-named namespace that
 * groups its types, tool table, dispatcher, and (for `AgentFs`) default
 * backend:
 *
 *   import { AgentFs, AgentTodos } from "@grida/agent-tools";
 *
 *   const fs = new AgentFs(new AgentFs.MemoryBackend());
 *   const todos = new AgentTodos();
 *
 *   // tool tables / dispatchers
 *   const tools = { ...AgentFs.tools, ...AgentTodos.tools };
 *   const output =
 *     AgentFs.resolveToolCall(fs, toolCall) ??
 *     AgentTodos.resolveToolCall(todos, toolCall);
 *
 * Env-restricted backends live behind their own subpaths so the main
 * entry never pulls `navigator.storage` or `node:fs`:
 *
 *   import { OpfsBackend } from "@grida/agent-tools/fs/backends/opfs";
 *   import { NodeFsBackend } from "@grida/agent-tools/fs/backends/node";
 *
 * Both implement `AgentFs.Backend`.
 */

export { AgentFs } from "./fs";
export { AgentTodos } from "./todos";

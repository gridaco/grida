/**
 * `@grida/agent/todos` — fundamental planning tool. Mirrors Claude
 * Code's `TodoWrite`: an in-memory, replace-all todo list the agent updates
 * as it works, rendered in the chat panel.
 *
 * State lives in memory, scoped to the session. We don't persist — the
 * plan is a function of the current turn, not a long-lived doc. (If you
 * want long-lived TODOs, write a markdown file with `agent-fs`; that's
 * the right tool for that job.)
 *
 * No React. Subscribe via `subscribe(cb)` and read `snapshot()` —
 * `useSyncExternalStore` is the host's call.
 *
 * Public surface is grouped under the `AgentTodos` class + a same-named
 * namespace:
 *
 *   import { AgentTodos } from "@grida/agent/todos";
 *
 *   const todos = new AgentTodos();
 *   const list: ReadonlyArray<AgentTodos.Todo> = todos.snapshot();
 *
 *   const tools = AgentTodos.tools;
 *   const output = AgentTodos.resolveToolCall(todos, toolCall);
 *
 * See `./README.md` for the full contract.
 */

import { tool } from "ai";
import { z } from "zod";

// ---------------------------------------------------------------------------
// AgentTodos — the class.
// ---------------------------------------------------------------------------

/**
 * `AgentTodos` — a tiny live store for the agent's plan.
 *
 * Mirrors Claude Code's `TodoWrite`:
 *   - Replace-all: every call carries the full list.
 *   - Status transitions: `pending` → `in_progress` → `completed`.
 *   - Exactly one `in_progress` at a time (enforced socially by the prompt,
 *     not the tool — the host shows a visible list so the model self-
 *     corrects).
 */
export class AgentTodos {
  private todos: AgentTodos.Todo[] = [];
  private readonly subs = new Set<() => void>();

  /** Current list. Cheap; safe to call in a render. */
  snapshot(): ReadonlyArray<AgentTodos.Todo> {
    return this.todos;
  }

  /**
   * Replace the entire list. Returns the count + the new snapshot for
   * the agent's tool result.
   */
  write(todos: ReadonlyArray<AgentTodos.Todo>): AgentTodos.WriteSuccess {
    // Defensive copy: callers don't get to mutate our internal array.
    const next = todos.map(normalize);
    // Skip notify on identity-equal replays — the agent re-sends the
    // full list every TodoWrite call and identical replays would
    // otherwise rerender every subscriber for no UI change.
    if (!shallowEqual(this.todos, next)) {
      this.todos = next;
      this.notify();
    }
    return { ok: true, count: this.todos.length, todos: this.todos };
  }

  /** Clear the list (e.g. start of a new turn). */
  clear(): void {
    if (this.todos.length === 0) return;
    this.todos = [];
    this.notify();
  }

  /** Subscribe to changes. Returns an unsubscribe fn. */
  subscribe(cb: () => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  private notify(): void {
    for (const cb of this.subs) cb();
  }
}

function normalize(t: AgentTodos.Todo): AgentTodos.Todo {
  return {
    content: t.content,
    active_form: t.active_form,
    status: t.status,
  };
}

function shallowEqual(
  a: ReadonlyArray<AgentTodos.Todo>,
  b: ReadonlyArray<AgentTodos.Todo>
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.content !== y.content ||
      x.active_form !== y.active_form ||
      x.status !== y.status
    ) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// AgentTodos — the namespace.
// ---------------------------------------------------------------------------

export namespace AgentTodos {
  // -------------------------------------------------------------------------
  // Data types
  // -------------------------------------------------------------------------

  export type Status = "pending" | "in_progress" | "completed";

  export type Todo = {
    /**
     * Imperative form of the task. Examples: "Run tests",
     * "Add focus styles", "Audit /svg agent".
     */
    content: string;
    /**
     * Present-continuous form, shown while this task is the current one
     * the agent is working on. Examples: "Running tests", "Adding focus
     * styles". Distinct from `content` because shells of words read
     * differently when paused vs. live.
     */
    active_form: string;
    status: Status;
  };

  export type WriteSuccess = {
    ok: true;
    count: number;
    todos: ReadonlyArray<Todo>;
  };

  // -------------------------------------------------------------------------
  // AI-SDK tool table
  //
  // One tool, one shape: pass the full list of todos every time. The host
  // renders the list in the chat panel; the agent updates it as it works.
  // -------------------------------------------------------------------------

  export const TOOL_NAMES = {
    todo_write: "todo_write",
  } as const;

  export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

  const STATUS = z.enum(["pending", "in_progress", "completed"]);

  const TODO = z.object({
    content: z
      .string()
      .min(1)
      .describe(
        'Imperative form of the task. Example: "Run tests", "Add focus styles".'
      ),
    active_form: z
      .string()
      .min(1)
      .describe(
        "Present-continuous form, shown while this task is in_progress. " +
          'Example: "Running tests", "Adding focus styles".'
      ),
    status: STATUS,
  });

  export const tools = {
    [TOOL_NAMES.todo_write]: tool({
      description:
        "Plan and track your work. Pass the complete list of todos every " +
        "call — the prior list is replaced wholesale.\n\n" +
        "Rules:\n" +
        "  • Exactly one task should be `in_progress` at any time.\n" +
        "  • Mark a task `completed` immediately after finishing it; don't " +
        "batch updates.\n" +
        "  • Status transitions: `pending` → `in_progress` → `completed`.\n\n" +
        "Use this any time the work is non-trivial (multiple files, multiple " +
        "steps, exploratory). Skip it for one-shot edits.",
      inputSchema: z.object({
        todos: z.array(TODO).describe("The complete new list of todos."),
      }),
      outputSchema: z.object({
        ok: z.literal(true),
        count: z.number().int(),
      }),
    }),
  } as const;

  export type Tools = typeof tools;

  // -------------------------------------------------------------------------
  // Tool-call dispatcher
  //
  // Symmetric to `AgentFs.resolveToolCall` — hosts can chain both in
  // `Chat.onToolCall`.
  // -------------------------------------------------------------------------

  type TodoWriteInput = { todos: ReadonlyArray<Todo> };

  export function resolveToolCall(
    store: AgentTodos,
    toolCall: { tool_name: string; input: unknown; dynamic?: boolean }
  ): unknown {
    if (toolCall.dynamic) return undefined;
    if (toolCall.tool_name !== TOOL_NAMES.todo_write) return undefined;
    const { todos } = toolCall.input as TodoWriteInput;
    const r = store.write(todos);
    return { ok: r.ok, count: r.count };
  }
}

/**
 * Session recorder.
 *
 * Converts AI SDK UI-message stream chunks into persisted session parts.
 * The store owns rows; this module owns chunk interpretation.
 */

import type { UIMessageChunk } from "ai";
import type { StreamConsumer } from "../runtime/stream-registry";
import type { SessionsStore } from "./store";

const TOOL_STATE_BY_CHUNK: Record<string, string> = {
  "tool-input-start": "input-streaming",
  "tool-input-delta": "input-streaming",
  "tool-input-available": "input-available",
  "tool-output-available": "output-available",
  "tool-output-error": "output-error",
};

export type RecorderConsumerOptions = {
  store: SessionsStore;
  session_id: string;
  /** Optional run id for log correlation. */
  run_id?: string;
  /**
   * Optional error sink. Defaults to `console.warn` with the agent host's
   * existing logging prefix. Tests inject a spy.
   */
  on_error?: (err: unknown) => void;
};

export function createRecorderConsumer(
  opts: RecorderConsumerOptions
): StreamConsumer {
  const accumulator = new PartAccumulator(opts);
  return {
    on_frame: (data) => {
      if (data === "[DONE]") return;
      let chunk: UIMessageChunk;
      try {
        chunk = JSON.parse(data) as UIMessageChunk;
      } catch {
        return;
      }
      accumulator.handle(chunk);
    },
    on_end: async (reason) => {
      // "abort" (user cancel) and "error" (failed run) both stop the run
      // early; mark so no *future* frame is recorded, but already-received
      // frames still flush below so the persisted message matches what the
      // user saw.
      if (reason !== "finish") accumulator.markAborted();
      await accumulator.flush(reason === "finish" ? "end" : "abort");
    },
    on_error: (err) => {
      try {
        opts.on_error?.(err);
      } catch {
        // never let the consumer's error path blow up the registry
      }
    },
  };
}

class PartAccumulator {
  private assistant_message_id: string | null = null;
  private part_index_counter = 0;
  private text_buffers = new Map<string, { index: number; text: string }>();
  private index_by_tool = new Map<string, number>();
  private tool_name_by_call = new Map<string, string>();
  /**
   * Last-known parsed input per toolCallId. A tool call's input arrives on
   * `tool-input-available` but NOT on the later `tool-output-available`
   * chunk; since `upsertPart` replaces the row's data wholesale, we re-attach
   * the remembered input on every write so the persisted part stays complete.
   * Without this the final write erases the input, and the next turn fails
   * `convertToModelMessages` input validation (surfaces as a UI "network
   * error"). See `runtime/message-view.ts`.
   */
  private input_by_tool = new Map<string, unknown>();
  private write_chain: Promise<unknown> = Promise.resolve();
  private aborted = false;

  constructor(private readonly opts: RecorderConsumerOptions) {}

  handle(chunk: UIMessageChunk) {
    // Drop frames that arrive *after* an abort, but never drop frames
    // already received: gating here (at enqueue time) rather than inside
    // handleAsync (at execution time) means the backlog the writeChain is
    // still draining gets persisted instead of silently skipped.
    if (this.aborted) return;
    this.enqueue(() => this.handleAsync(chunk));
  }

  markAborted() {
    this.aborted = true;
  }

  async flush(_reason: "end" | "abort"): Promise<void> {
    try {
      await this.write_chain;
    } catch {
      // Errors are already reported via onError in the per-write catch.
    }
    if (this.assistant_message_id) {
      try {
        await this.opts.store.finalizeMessage(this.assistant_message_id);
      } catch (err) {
        this.report(err);
      }
    } else {
      try {
        await this.opts.store.touch(this.opts.session_id);
      } catch (err) {
        this.report(err);
      }
    }
  }

  private enqueue(task: () => Promise<void>) {
    this.write_chain = this.write_chain
      .catch(() => undefined)
      .then(task)
      .catch((err) => this.report(err));
  }

  private async handleAsync(chunk: UIMessageChunk) {
    const type = chunk.type as string;

    if (type === "text-start") {
      const id = (chunk as { id?: string }).id;
      if (typeof id !== "string") return;
      const messageId = await this.ensureAssistantMessage();
      const partIndex = this.part_index_counter++;
      this.text_buffers.set(id, { index: partIndex, text: "" });
      await this.opts.store.upsertPart(messageId, {
        index: partIndex,
        type: "text",
        data: { type: "text", text: "" },
        tool_call_id: null,
        tool_state: null,
        session_id: this.opts.session_id,
      });
      return;
    }
    if (type === "text-delta") {
      const id = (chunk as { id?: string; delta?: string }).id;
      const delta = (chunk as { delta?: string }).delta ?? "";
      if (typeof id !== "string") return;
      const buf = this.text_buffers.get(id);
      if (!buf) return;
      buf.text += delta;
      const messageId = await this.ensureAssistantMessage();
      await this.opts.store.upsertPart(messageId, {
        index: buf.index,
        type: "text",
        data: { type: "text", text: buf.text },
        tool_call_id: null,
        tool_state: null,
        session_id: this.opts.session_id,
      });
      return;
    }
    if (type === "text-end") return;

    if (
      type === "reasoning-start" ||
      type === "reasoning-delta" ||
      type === "reasoning-end"
    ) {
      const id = (chunk as { id?: string }).id;
      const delta = (chunk as { delta?: string }).delta ?? "";
      if (typeof id !== "string") return;
      if (type === "reasoning-start") {
        const messageId = await this.ensureAssistantMessage();
        const partIndex = this.part_index_counter++;
        this.text_buffers.set(`reasoning:${id}`, {
          index: partIndex,
          text: "",
        });
        await this.opts.store.upsertPart(messageId, {
          index: partIndex,
          type: "reasoning",
          data: { type: "reasoning", text: "" },
          tool_call_id: null,
          tool_state: null,
          session_id: this.opts.session_id,
        });
        return;
      }
      if (type === "reasoning-delta") {
        const buf = this.text_buffers.get(`reasoning:${id}`);
        if (!buf) return;
        buf.text += delta;
        const messageId = await this.ensureAssistantMessage();
        await this.opts.store.upsertPart(messageId, {
          index: buf.index,
          type: "reasoning",
          data: { type: "reasoning", text: buf.text },
          tool_call_id: null,
          tool_state: null,
          session_id: this.opts.session_id,
        });
      }
      return;
    }

    if (
      type === "tool-input-start" ||
      type === "tool-input-delta" ||
      type === "tool-input-available" ||
      type === "tool-output-available" ||
      type === "tool-output-error"
    ) {
      const c = chunk as {
        tool_call_id?: string;
        toolCallId?: string;
        tool_name?: string;
        toolName?: string;
        input?: unknown;
        input_text_delta?: string;
        inputTextDelta?: string;
        output?: unknown;
        error_text?: string;
        errorText?: string;
        provider_executed?: boolean;
        providerExecuted?: boolean;
        dynamic?: boolean;
      };
      const toolCallId = c.tool_call_id ?? c.toolCallId;
      if (typeof toolCallId !== "string") return;
      const messageId = await this.ensureAssistantMessage();
      let partIndex = this.index_by_tool.get(toolCallId);
      if (partIndex === undefined) {
        partIndex = this.part_index_counter++;
        this.index_by_tool.set(toolCallId, partIndex);
      }
      const toolName = c.tool_name ?? c.toolName;
      if (typeof toolName === "string" && toolName.length > 0) {
        this.tool_name_by_call.set(toolCallId, toolName);
      }
      if (c.input !== undefined) {
        this.input_by_tool.set(toolCallId, c.input);
      }
      const stickyToolName = this.tool_name_by_call.get(toolCallId);
      const stickyInput = this.input_by_tool.get(toolCallId);
      const toolState = TOOL_STATE_BY_CHUNK[type]!;
      const partType = c.dynamic
        ? "dynamic-tool"
        : stickyToolName
          ? `tool-${stickyToolName}`
          : "tool";
      const data: Record<string, unknown> = {
        type: partType,
        tool_call_id: toolCallId,
        tool_name: stickyToolName,
        state: toolState,
      };
      // Use the remembered input, not `c.input`: the terminal
      // `tool-output-available` chunk omits it, and upsertPart replaces the
      // row wholesale, so reading the chunk here would erase the input on the
      // final write and poison the session for the next turn.
      if (stickyInput !== undefined) data.input = stickyInput;
      const inputTextDelta = c.input_text_delta ?? c.inputTextDelta;
      if (inputTextDelta !== undefined) data.input_text_delta = inputTextDelta;
      if (c.output !== undefined) data.output = c.output;
      const errorText = c.error_text ?? c.errorText;
      if (errorText !== undefined) data.error_text = errorText;
      const providerExecuted = c.provider_executed ?? c.providerExecuted;
      if (providerExecuted !== undefined) {
        data.provider_executed = providerExecuted;
      }
      await this.opts.store.upsertPart(messageId, {
        index: partIndex,
        type: partType,
        data,
        tool_call_id: toolCallId,
        tool_state: toolState,
        session_id: this.opts.session_id,
      });
      return;
    }

    if (type === "finish-step" || type === "finish") return;

    if (
      type === "file" ||
      type === "source-url" ||
      type === "source-document" ||
      type.startsWith("data-")
    ) {
      const messageId = await this.ensureAssistantMessage();
      const partIndex = this.part_index_counter++;
      await this.opts.store.upsertPart(messageId, {
        index: partIndex,
        type,
        data: chunk,
        tool_call_id: null,
        tool_state: null,
        session_id: this.opts.session_id,
      });
    }
  }

  private async ensureAssistantMessage(): Promise<string> {
    if (this.assistant_message_id) return this.assistant_message_id;
    const msg = await this.opts.store.appendMessage(this.opts.session_id, {
      role: "assistant",
    });
    this.assistant_message_id = msg.id;
    return msg.id;
  }

  private report(err: unknown) {
    const sink = this.opts.on_error;
    if (sink) {
      try {
        sink(err);
        return;
      } catch {
        // fall through to console
      }
    }
    const tag = this.opts.run_id ? `runId=${this.opts.run_id}` : "";
    console.warn(
      `[agent-host-sessions] recorder write failed ${tag} err=${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

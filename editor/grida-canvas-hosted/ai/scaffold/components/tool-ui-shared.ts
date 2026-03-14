import type { ToolUIPart } from "ai";

/**
 * Common props for all tool UI components.
 *
 * Tool UIs that need `input` extend this with a typed `input` field.
 */
export interface ToolUIBaseProps {
  state: ToolUIPart["state"];
  errorText?: string;
}

/** Props for tools that display input + output. */
export interface ToolUIProps<I = unknown, O = unknown>
  extends ToolUIBaseProps {
  input: I;
  output: O | undefined;
}

/** Props for tools that only display output. */
export interface ToolUIOutputProps<O = unknown> extends ToolUIBaseProps {
  output: O | undefined;
}

// ---------------------------------------------------------------------------
// Tool-specific I/O types (derived from canvas-use Zod schemas)
// ---------------------------------------------------------------------------

export type SvgInput = { name?: string; svg: string };
export type SvgOutput = { node_id: string };

export type MarkdownInput = { markdown: string };
export type MarkdownOutput = { node_id: string };

export type TreeOutput = { tree: string };

export type GenerateImageInput = { prompt: string; [key: string]: unknown };
export type GenerateImageOutput = {
  publicUrl?: string;
  base64?: string;
  width?: number;
  height?: number;
  modelId?: string;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Shared state helpers
// ---------------------------------------------------------------------------

export function deriveToolState(state: ToolUIPart["state"]) {
  return {
    isRunning: state === "input-streaming" || state === "input-available",
    isDone: state === "output-available",
    isError: state === "output-error",
  } as const;
}

import { AgentSurface } from "@grida/agent/surface";
import { getToolName } from "ai";
import type { ToolCallEntry } from "@/lib/agent-chat";

export type SurfaceToolData =
  | {
      kind: "open";
      path?: string;
      requested?: boolean;
    }
  | {
      kind: "list";
      active: string | null;
      open: string[];
      interactive?: boolean;
    };

/**
 * A small, read-only view of the surface tool protocol for transcript UI.
 * Tool payloads cross a persistence/streaming boundary, so the renderer parses
 * them as unknown rather than casting protocol output directly.
 */
export class SurfaceToolCall {
  private constructor(readonly data: SurfaceToolData) {}

  static from(entry: ToolCallEntry): SurfaceToolCall | null {
    const toolName = getToolName(entry);
    const input = record(entry.input);
    const output = record(entry.output);

    if (toolName === AgentSurface.TOOL_NAMES.surface_open) {
      return new SurfaceToolCall({
        kind: "open",
        path: stringValue(input.path) ?? stringValue(output.path),
        requested: booleanValue(output.requested),
      });
    }

    if (toolName === AgentSurface.TOOL_NAMES.surface_list_open) {
      return new SurfaceToolCall({
        kind: "list",
        active: stringValue(output.active) ?? null,
        open: stringArray(output.open),
        interactive: booleanValue(output.interactive),
      });
    }

    return null;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

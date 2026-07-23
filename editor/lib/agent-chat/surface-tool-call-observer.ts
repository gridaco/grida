import { AgentSurface } from "@grida/agent/surface";

export type SurfaceToolCall = {
  readonly tool_name: string;
  readonly tool_call_id: string;
  readonly input: unknown;
  readonly dynamic?: boolean;
};

/**
 * Per-chat observer for host-owned surface tool side effects.
 *
 * Stream reconnects replay the complete buffered tool-call log. The AI SDK
 * therefore reports the same completed `surface_open` call again even though
 * it represents one model action. Presentation is auxiliary and best-effort,
 * so each tool-call id may request host navigation at most once for the
 * lifetime of the owning Chat instance.
 */
export class SurfaceToolCallObserver {
  private readonly observed_open_ids = new Set<string>();

  observe(host: AgentSurface.Host, toolCall: SurfaceToolCall): boolean {
    const isOpen = toolCall.tool_name === AgentSurface.TOOL_NAMES.surface_open;

    if (!isOpen) {
      return AgentSurface.observeToolCall(host, toolCall);
    }

    if (this.observed_open_ids.has(toolCall.tool_call_id)) {
      return true;
    }

    // Reserve before invoking the host so even a synchronous re-entrant
    // observation cannot apply the same presentation request twice. Invalid
    // calls are released and may be observed again if a later frame completes
    // their input.
    this.observed_open_ids.add(toolCall.tool_call_id);
    const observed = AgentSurface.observeToolCall(host, toolCall);
    if (!observed) {
      this.observed_open_ids.delete(toolCall.tool_call_id);
    }
    return observed;
  }
}

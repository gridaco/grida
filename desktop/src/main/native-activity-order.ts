// GRIDA-SEC-004 — bounded presentation coordinates are not execution authority.
import type { NativeChatMessage } from "@grida/desktop-bridge";
import { NativeAgentHistory } from "./native-agent-history";

/** Decode retained public positions only after negotiating their exact contract. */
export namespace NativeActivityOrder {
  export const capability = "co.grida/session/activity-order";
  export type Fact = Pick<
    NativeChatMessage,
    "activityOrder" | "activityOrderIncomplete"
  >;

  /** Uniform metadata also covers ACP chunks without private stream/window attribution. */
  export function notification(
    metadata: Readonly<Record<string, unknown>> | undefined,
    attribution: Readonly<Record<string, unknown>> | undefined,
    available: boolean,
    required = false
  ): Fact & Pick<NativeChatMessage, "turnId"> {
    if (!available) return {};
    const value = metadata?.[capability];
    if (value === undefined) return read(attribution ?? {}, true, required);
    const uniform = NativeAgentHistory.object(value);
    if (!uniform) throw invalid();
    const direct = read(attribution ?? {}, true);
    const projected = read(uniform, true, required);
    if (
      (direct.activityOrder !== undefined ||
        direct.activityOrderIncomplete !== undefined) &&
      (direct.activityOrder !== projected.activityOrder ||
        direct.activityOrderIncomplete !== projected.activityOrderIncomplete)
    )
      throw invalid();
    const turn = uniform.turnId;
    const owner = attribution?.turnId;
    if (turn !== undefined && !NativeAgentHistory.identity(turn))
      throw invalid();
    if (owner !== undefined && !NativeAgentHistory.identity(owner))
      throw invalid();
    if (turn !== undefined && owner !== undefined && turn !== owner)
      throw invalid();
    return { ...projected, ...(turn !== undefined && { turnId: turn }) };
  }

  export function read(
    value: Readonly<Record<string, unknown>>,
    available: boolean,
    required = false
  ): Fact {
    if (!available) return {};
    const order = coordinate(value.activityOrder);
    const incomplete = value.activityOrderIncomplete;
    if (incomplete !== undefined && incomplete !== true) throw invalid();
    if (order !== undefined && incomplete !== undefined) throw invalid();
    if (order !== undefined) return { activityOrder: order };
    if (incomplete === true) return { activityOrderIncomplete: true };
    if (required) throw invalid();
    return {};
  }

  export function coordinate(value: unknown): number | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
      throw invalid();
    return value;
  }

  /** Retained evidence can fill a gap; a known position cannot move or disappear. */
  export function merge(previous: Fact, incoming: Fact): Fact {
    if (previous.activityOrder !== undefined) {
      if (
        incoming.activityOrder !== undefined &&
        incoming.activityOrder !== previous.activityOrder
      )
        throw invalid();
      return { activityOrder: previous.activityOrder };
    }
    if (incoming.activityOrder !== undefined)
      return { activityOrder: incoming.activityOrder };
    if (
      previous.activityOrderIncomplete === true ||
      incoming.activityOrderIncomplete === true
    )
      return { activityOrderIncomplete: true };
    return {};
  }

  function invalid(): Error {
    return new Error("native_chat_activity_order_invalid");
  }
}

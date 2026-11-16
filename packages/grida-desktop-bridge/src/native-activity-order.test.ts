// GRIDA-SEC-004 — retained presentation positions confer no execution or control authority.
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  NativeChatActivity,
  NativeChatMessage,
  NativeChatTextUpdate,
  NativeSubagentActivityPage,
  NativeSubagentLifecycleEvent,
} from "./index";

describe("retained activity order", () => {
  it("keeps ordering optional on legacy messages, calls and live text", () => {
    const message: NativeChatMessage = {
      messageId: "message",
      role: "assistant",
      text: "Earlier work",
    };
    const call: NativeChatActivity = {
      callId: "call",
      title: "read_file",
      kind: "read",
      outcome: "succeeded",
    };
    const update: NativeChatTextUpdate = {
      kind: "text",
      role: "assistant",
      messageId: "message",
      turnId: "turn",
      text: "Earlier work",
      offsetBytes: 0,
      replace: true,
    };
    expect(message.activityOrder).toBeUndefined();
    expect(call.activityOrder).toBeUndefined();
    expect(update.activityOrder).toBeUndefined();
    expectTypeOf<NativeChatMessage["activityOrder"]>().toEqualTypeOf<
      number | undefined
    >();
    expectTypeOf<NativeChatActivity["activityOrder"]>().toEqualTypeOf<
      number | undefined
    >();
    expectTypeOf<NativeChatTextUpdate["activityOrder"]>().toEqualTypeOf<
      number | undefined
    >();
  });

  it("keeps message and individual tool coordinates distinct within the same turn", () => {
    const message: NativeChatMessage = {
      messageId: "commentary",
      role: "assistant",
      text: "Checking both options.",
      turnId: "parent-turn",
      activityOrder: 2,
      activity: [
        {
          callId: "read",
          title: "read_file",
          kind: "read",
          outcome: "succeeded",
          activityOrder: 4,
        },
      ],
    };
    const child: NativeSubagentLifecycleEvent = {
      eventId: "start",
      childId: "child",
      name: "Reviewer",
      kind: "started",
      childTurnId: "child-turn",
      parentTurnId: "parent-turn",
      inputId: "assignment",
      atMs: 100,
      activityOrder: 3,
    };
    expect([
      message.activityOrder,
      child.activityOrder,
      message.activity?.[0].activityOrder,
    ]).toEqual([2, 3, 4]);
    expectTypeOf<NativeSubagentLifecycleEvent["activityOrder"]>().toEqualTypeOf<
      number | undefined
    >();
    // @ts-expect-error Presentation order is not a control token or accepted-work revision.
    void child.observationId;
  });

  it("represents missing retained order without manufacturing a coordinate", () => {
    const message: NativeChatMessage = {
      messageId: "legacy",
      role: "assistant",
      text: "Retained answer",
      turnId: "turn",
      activityOrderIncomplete: true,
    };
    expect(message.activityOrder).toBeUndefined();
    expect(message.activityOrderIncomplete).toBe(true);
    expectTypeOf<NativeChatMessage["activityOrderIncomplete"]>().toEqualTypeOf<
      true | undefined
    >();
    expectTypeOf<NativeChatActivity["activityOrderIncomplete"]>().toEqualTypeOf<
      true | undefined
    >();
    expectTypeOf<
      NativeChatTextUpdate["activityOrderIncomplete"]
    >().toEqualTypeOf<true | undefined>();
    expectTypeOf<NativeSubagentActivityPage["orderComplete"]>().toEqualTypeOf<
      boolean | undefined
    >();
  });
});

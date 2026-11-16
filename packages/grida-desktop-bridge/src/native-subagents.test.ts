// GRIDA-SEC-004 — child observation carries no child attachment or control authority.
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  DesktopNativeChat,
  NativeChatEffort,
  NativeChatSnapshot,
  NativeSubagentActivityPage,
  NativeSubagentConversation,
  NativeSubagentExecution,
  NativeSubagentStatus,
} from "./index";

describe("child activity observation", () => {
  it("keeps richer reads and negotiation optional for older hosts", () => {
    const older: Pick<
      DesktopNativeChat,
      "subagentActivity" | "subagentConversation"
    > = {};
    expect(older.subagentActivity).toBeUndefined();
    expect(older.subagentConversation).toBeUndefined();
    expectTypeOf<
      NativeChatSnapshot["subagentActivityAvailable"]
    >().toEqualTypeOf<true | undefined>();
    expectTypeOf<
      Parameters<NonNullable<DesktopNativeChat["subagentActivity"]>>
    >().toEqualTypeOf<[attachmentId: string, afterChildId?: string]>();
    expectTypeOf<
      Awaited<ReturnType<NonNullable<DesktopNativeChat["subagentActivity"]>>>
    >().toEqualTypeOf<NativeSubagentActivityPage>();
    expectTypeOf<
      Parameters<NonNullable<DesktopNativeChat["subagentConversation"]>>
    >().toEqualTypeOf<
      [attachmentId: string, childId: string, before?: string]
    >();
    expectTypeOf<
      Awaited<
        ReturnType<NonNullable<DesktopNativeChat["subagentConversation"]>>
      >
    >().toEqualTypeOf<NativeSubagentConversation>();
  });

  it("distinguishes unresolved work, completed history and bounded counts", () => {
    const page: NativeSubagentActivityPage = {
      children: [
        {
          childId: "child",
          name: "Layout review",
          kind: "review",
          status: "uncertain",
          section: "active",
          latestTurnId: "child-turn",
        },
      ],
      nextAfterChildId: null,
      counts: { active: 1, done: 512, complete: false },
      observedAtMs: 1_700_000_000_000,
      events: [
        {
          eventId: "event",
          childId: "child",
          name: "Layout review",
          kind: "started",
          childTurnId: "child-turn",
          parentTurnId: "sponsor-turn",
          inputId: "assignment",
          atMs: 1_700_000_000_000,
        },
      ],
      eventsComplete: false,
    };
    expect(page.children[0].updatedAtMs).toBeUndefined();
    expect(page.counts.complete).toBe(false);
    expect(page.eventsComplete).toBe(false);
    expect(page.events[0].childId).toBe(page.children[0].childId);
    expectTypeOf<NativeSubagentStatus>().toEqualTypeOf<
      | "ready"
      | "queued"
      | "running"
      | "paused"
      | "interrupted"
      | "succeeded"
      | "failed"
      | "cancelled"
      | "uncertain"
    >();
  });

  it("keeps actual messages, captured execution and live availability separate", () => {
    const captured: NativeSubagentExecution = {
      model: "captured-model",
      effort: null,
    };
    const conversation: NativeSubagentConversation = {
      childId: "child",
      name: "Review",
      kind: "named",
      view: 4,
      messages: [
        {
          messageId: "message",
          turnId: "turn",
          role: "assistant",
          phase: "progress",
          text: "Checking the constraints.",
          live: true,
          truncated: true,
        },
      ],
      turns: [
        {
          turnId: "turn",
          startedAtMs: 1_700_000_000_000,
          status: null,
          execution: captured,
        },
      ],
      execution: captured,
      older: "opaque-attachment-bound-token",
      live: { available: true, truncated: false },
      observedAtMs: 1_700_000_000_000,
    };
    expect(conversation.execution?.model).toBe("captured-model");
    expect(conversation.execution?.effort).toBeNull();
    expect(conversation.messages[0].live).toBe(true);
    expectTypeOf<
      NativeSubagentExecution["effort"]
    >().toEqualTypeOf<NativeChatEffort | null>();
    expectTypeOf<NativeSubagentExecution["model"]>().toEqualTypeOf<
      string | null
    >();
    // @ts-expect-error Conversation observation is not a child session attachment.
    void conversation.attachmentId;
    // @ts-expect-error Provider private state is outside the public observation DTO.
    void conversation.providerState;
  });
});

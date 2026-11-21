import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { NativeChatMessage } from "@grida/desktop-bridge";
import { turn_activity } from "@/lib/agent-chat/turn-activity";
import { NativeTurnActivity } from "./native-turn-activity";
import { NativeActivityFixtures } from "./native-agent-activity.fixtures";

describe("NativeTurnActivity", () => {
  it("shows a running turn's tool calls with the chat kit's tool cards", () => {
    const messages: NativeChatMessage[] = [
      { messageId: "ask", role: "user", text: "Check the cart.", turnId: "t" },
      {
        messageId: "work",
        role: "assistant",
        text: "Reading the cart module.",
        turnId: "t",
        activity: [
          {
            callId: "c1",
            title: "read_file",
            kind: "read",
            outcome: "succeeded",
            input: { path: "src/cart.js" },
            output: { text: "export const a = 1;\n", truncated: false },
          },
        ],
      },
    ];
    const [block] = turn_activity.group(
      messages,
      [{ turnId: "t", status: null, startedAtMs: 0 }],
      { turnId: "t" },
      null
    );
    expect(block?.kind).toBe("turn");
    const html = renderToStaticMarkup(
      <NativeTurnActivity
        block={block as Extract<typeof block, { kind: "turn" }>}
        approvalReviews={[
          { decision: "approved", action: "/reference/prices.csv" },
          { decision: "declined", action: "example.org:443" },
        ]}
        renderMessage={(message) => (
          <p key={message.messageId}>{message.text}</p>
        )}
      />
    );
    // The kit's read card names the action and the file, not the tool id.
    expect(html).toContain("Automatically approved");
    expect(html).toContain("example.org:443");
    expect(html).toContain("Automatically declined");
    expect(html).toContain("Read file");
    expect(html).toContain("cart.js");
    expect(html).not.toContain("read_file");
  });

  it("labels legacy unplaced events and makes a child-only finished turn expandable", async () => {
    const fixture = await NativeActivityFixtures.create();
    try {
      const events = [...fixture.data.activity.events].reverse();
      const [block] = turn_activity.group(
        [
          {
            messageId: "ask",
            role: "user",
            text: "Review it",
            turnId: "parent-turn",
          },
        ],
        [{ turnId: "parent-turn", startedAtMs: 0, status: null }],
        { turnId: "parent-turn" }
      );
      const html = renderToStaticMarkup(
        <NativeTurnActivity
          block={block as Extract<typeof block, { kind: "turn" }>}
          renderMessage={(message) => (
            <p key={message.messageId}>{message.text}</p>
          )}
          subagentEvents={events}
          onOpenSubagent={() => {}}
        />
      );
      expect(html).toContain("Reviewer");
      expect(html).toContain("started working");
      expect(html).toContain("finished");
      expect(html).toContain("Subagent events — relative order unavailable");
      expect(html.indexOf("started working")).toBeLessThan(
        html.indexOf("finished")
      );
      expect(html).toContain('data-child-identity="done-child"');
      const finished = {
        ...(block as Extract<typeof block, { kind: "turn" }>),
        finished: true,
        outcome: "succeeded" as const,
      };
      const collapsed = renderToStaticMarkup(
        <NativeTurnActivity
          block={finished}
          renderMessage={(message) => (
            <p key={message.messageId}>{message.text}</p>
          )}
          subagentEvents={events}
          onOpenSubagent={() => {}}
        />
      );
      expect(collapsed).toContain('aria-expanded="false"');
      expect(collapsed).toContain("Worked");
    } finally {
      fixture.dispose();
    }
  });

  it("keeps stopped work expanded, places a child stop correctly, and leaves the final answer outside", async () => {
    const fixture = await NativeActivityFixtures.create();
    try {
      const messages: NativeChatMessage[] = [
        {
          messageId: "before",
          role: "assistant",
          turnId: "parent-turn",
          text: "Before the child stopped",
          phase: "progress",
          activityOrder: 1,
        },
        {
          messageId: "after",
          role: "assistant",
          turnId: "parent-turn",
          text: "After the child stopped",
          phase: "progress",
          activityOrder: 3,
        },
        {
          messageId: "answer",
          role: "assistant",
          turnId: "parent-turn",
          text: "Final answer outside activity",
          phase: "answer",
          activityOrder: 4,
        },
      ];
      const [block] = turn_activity.group(
        messages,
        [{ turnId: "parent-turn", startedAtMs: 0, status: "cancelled" }],
        null
      );
      if (block.kind !== "turn") throw new Error("expected_turn");
      const html = renderToStaticMarkup(
        <NativeTurnActivity
          block={block}
          renderMessage={(message) => (
            <p key={message.messageId}>{message.text}</p>
          )}
          subagentEvents={[
            {
              ...fixture.data.activity.events[1],
              activityOrder: 2,
              status: "cancelled",
            },
          ]}
          onOpenSubagent={() => {}}
        />
      );
      expect(html).toContain("You stopped");
      expect(html).not.toContain("aria-expanded");
      expect(html).not.toContain("relative order unavailable");
      expect(html.indexOf("Before the child stopped")).toBeLessThan(
        html.indexOf('data-child-identity="done-child"')
      );
      expect(html.indexOf('data-child-identity="done-child"')).toBeLessThan(
        html.indexOf("After the child stopped")
      );
      expect(html.indexOf("After the child stopped")).toBeLessThan(
        html.indexOf("Final answer outside activity")
      );
    } finally {
      fixture.dispose();
    }
  });
});

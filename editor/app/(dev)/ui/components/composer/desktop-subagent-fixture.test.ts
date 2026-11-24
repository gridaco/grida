import { describe, expect, it } from "vitest";
import { NativeSubagentController } from "@/lib/agent-chat/native-subagent-controller";
import { DesktopConversationFixtures } from "./desktop-conversation-fixtures";
import { DesktopSubagentFixture } from "./desktop-subagent-fixture";

describe("Native Chat demo subagent reads", () => {
  it("opens a recorded assignment through the production child controller", async () => {
    const activity =
      DesktopConversationFixtures.get("subagents").subagentActivity!;
    const parent = "preview-parent";
    const refused = async (): Promise<never> => {
      throw new Error("fixture_read_only");
    };
    const controller = new NativeSubagentController(
      {
        ...DesktopSubagentFixture.forParent(parent),
        subagentActivity: async () => activity,
        createSubagent: refused,
        assignSubagent: refused,
        stopSubagent: refused,
      },
      parent,
      () => ({
        observationId: "preview-observation",
        snapshot: {
          sessionId: parent,
          sessionRevision: 1,
          current: null,
          latest: null,
          admissionPaused: false,
          queuedInputs: 0,
          subagentsAvailable: true,
          subagentActivityAvailable: true,
        },
      })
    );

    try {
      controller.parentUpdated();
      for (const event of activity.events) {
        if (event.kind !== "finished") continue;
        await controller.openChild(event.childId, event.inputId);
        expect(controller.read()).toMatchObject({
          detail: true,
          error: null,
          conversationError: null,
          conversation: {
            childId: event.childId,
            name: event.name,
            turns: [{ turnId: event.childTurnId, status: event.status }],
          },
          observation: {
            stopObservationId: null,
            child: {
              assignment: {
                inputId: event.inputId,
                parentTurnId: event.parentTurnId,
              },
            },
          },
        });
      }
    } finally {
      controller.dispose();
    }
  });

  it("rejects reads with unrelated parent, child, or assignment identities", async () => {
    const reads = DesktopSubagentFixture.forParent("fixture-parent");
    await expect(reads.listSubagents("other-parent")).rejects.toThrow(
      "fixture_subagent_parent_unavailable"
    );
    await expect(
      reads.subagentConversation("fixture-parent", "unknown-review")
    ).rejects.toThrow("fixture_subagent_unavailable");
    await expect(
      reads.inspectSubagent("fixture-parent", "layout-review", "unknown-input")
    ).rejects.toThrow("fixture_subagent_assignment_unavailable");
  });
});

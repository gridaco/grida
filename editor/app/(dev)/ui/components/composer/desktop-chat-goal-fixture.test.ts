import { expect, it, vi } from "vitest";
import { NativeChatController } from "@/lib/agent-chat/native-chat-controller";
import { DesktopChatFixture } from "./desktop-chat-fixture";

it("queues a Goal behind ordinary work and drives the production Goal controls", async () => {
  const fixture = new DesktopChatFixture("empty", false);
  const controller = new NativeChatController(fixture.bridge);
  const objective = "Prepare and verify the gallery handout";
  fixture.setReplyHeld(true);
  try {
    controller.connect(fixture.sessionId);
    await vi.waitFor(() => expect(controller.read().loading).toBe(false));
    await controller.submitFromComposer(
      "Review the gallery layout",
      controller.read().scope
    );
    await vi.waitFor(() => expect(controller.canStartGoal).toBe(true));
    const started = await controller.startGoal({
      objective,
      criteria: [objective],
      automatic: true,
    });
    expect(started).toBe(true);
    expect(controller.read().goal?.goal).toBeNull();
    const waiting = controller.read().observation?.snapshot.pendingGoalId;
    expect(waiting).toBeTruthy();
    expect(controller.read().queue?.items[0]).toMatchObject({
      inputId: waiting,
      goalStart: { objective },
      steerable: false,
    });

    fixture.finishReply();
    await vi.waitFor(() =>
      expect(controller.read().goal?.goal).toMatchObject({
        goalId: waiting,
        state: { status: "active" },
      })
    );
    const active = controller.read().goal?.goal?.reservation?.turnId;
    expect(active).toBeTruthy();

    await controller.controlGoal("pause");
    expect(controller.read().goal?.goal?.paused).toBe(true);
    expect(controller.read().observation?.snapshot.current).toMatchObject({
      turnId: active,
      disposition: "suspended",
      paused: true,
    });
    await controller.controlGoal("resume");
    expect(controller.read().goal?.goal?.paused).toBe(false);
    expect(controller.read().observation?.snapshot.current).toMatchObject({
      turnId: active,
      disposition: "running",
    });

    fixture.failReply();
    await vi.waitFor(() =>
      expect(controller.read().goal?.goal?.state).toEqual({
        status: "blocked",
        reason: "no_progress",
      })
    );
    await controller.controlGoal("resume");
    expect(controller.read().goal?.goal?.reservation?.turnId).not.toBe(active);
    expect(controller.read().goal?.goal?.goalId).toBe(waiting);
    const resumed = controller.read().goal?.goal?.reservation?.turnId;
    expect(resumed).toBeTruthy();
    const revision = controller.read().goal!.goalRevision!;
    const changedObjective = "Verify the final gallery layout";
    expect(
      await controller.reviseGoal(
        {
          scope: controller.read().scope,
          goalId: waiting!,
          goalRevision: revision,
        },
        { description: changedObjective, criteria: [changedObjective] }
      )
    ).toBe(true);
    expect(controller.read().goal?.goal).toMatchObject({
      goalId: waiting,
      objective: changedObjective,
      state: { status: "active" },
    });
    expect(controller.read().goal?.goal?.reservation?.turnId).not.toBe(resumed);

    fixture.finishReply();
    await vi.waitFor(() =>
      expect(controller.read().goal?.goal?.state).toEqual({
        status: "complete",
      })
    );
    expect(
      controller.read().messages.filter(({ text }) => text === objective)
    ).toHaveLength(1);

    await controller.controlGoal("clear");
    expect(controller.read().goal?.goal?.state).toEqual({ status: "cleared" });
  } finally {
    controller.disconnect();
  }
});

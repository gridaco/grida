import { describe, expect, it } from "vitest";
import { DesktopChatSettingsFixture } from "./desktop-chat-settings-fixture";
import { DesktopComposerFixtures } from "./desktop-fixtures";

const profiles = DesktopComposerFixtures.profiles;

describe("native chat fixture settings", () => {
  it("promotes the exact draft selection and retains speed only for that chat", async () => {
    const settings = new DesktopChatSettingsFixture({ profiles });
    const { bridge } = settings;
    const draft = { draftId: "draft-a" };
    const chat = { sessionId: "chat-a" };

    expect(await bridge.turnCapabilities(draft)).toMatchObject({
      status: "available",
      speeds: ["fast"],
    });
    const choice = { profileId: "fixture-b", effort: "high" } as const;
    await bridge.updateSelection(draft, 0, "model-change", choice);
    const speed = { ...choice, speed: "fast" } as const;
    const selected = await bridge.updateSelection(
      draft,
      1,
      "speed-change",
      speed
    );
    await expect(
      bridge.updateSelection(draft, 1, "speed-change", speed)
    ).resolves.toEqual(selected);
    expect((await bridge.profiles())?.newChatDefault).toEqual({
      ...choice,
      modelId: "Example model B",
    });

    const created = settings.createFromDraft(draft.draftId, chat.sessionId);
    expect(settings.createFromDraft(draft.draftId, "unused")).toEqual(created);
    expect(await bridge.selection(chat)).toMatchObject({
      target: chat,
      selection: speed,
    });
    expect(settings.model(chat.sessionId)).toBe("Example model B");

    const otherChat = { sessionId: "chat-b" };
    await expect(
      bridge.updateSelection(otherChat, 2, "stale", choice)
    ).rejects.toThrow("selection_revision_changed");
    const local = { profileId: "fixture-local", effort: "medium" } as const;
    await bridge.updateSelection(otherChat, 0, "local", local);
    expect(await bridge.turnCapabilities(otherChat)).toEqual({
      status: "unsupported",
      speeds: [],
      webSearch: false,
    });
    expect((await bridge.selection(chat)).selection?.speed).toBe("fast");
  });

  it("requires a matching Full access confirmation and keeps each chat's mode", async () => {
    const settings = new DesktopChatSettingsFixture({ profiles });
    const { bridge } = settings;
    const { attachmentId } = settings.createFromDraft(
      "draft-a",
      "chat-a",
      true
    );
    const other = settings.createFromDraft("draft-b", "chat-b");
    expect((await bridge.permissionMode(attachmentId)).mode).toBe("restricted");
    expect((await bridge.permissionMode(other.attachmentId)).mode).toBe(
      "approve_for_me"
    );

    await expect(
      bridge.setPermissionMode(attachmentId, 0, "full", "full_access")
    ).rejects.toThrow("permission_mode_confirmation_required");

    const { reviewId } = await bridge.reviewPermissionMode(
      attachmentId,
      0,
      "full"
    );
    await expect(
      bridge.setPermissionMode(attachmentId, 0, "other", "full_access", {
        reviewId,
        confirmed: true,
      })
    ).rejects.toThrow("permission_mode_review_changed");

    await expect(
      bridge.setPermissionMode(attachmentId, 0, "full", "full_access", {
        reviewId,
        confirmed: false,
      })
    ).resolves.toBeNull();
    expect((await bridge.permissionMode(attachmentId)).mode).toBe("restricted");

    const review = await bridge.reviewPermissionMode(attachmentId, 0, "full");
    const confirm = { reviewId: review.reviewId, confirmed: true };
    const changed = await bridge.setPermissionMode(
      attachmentId,
      0,
      "full",
      "full_access",
      confirm
    );
    expect(changed).toMatchObject({ mode: "full_access", revision: 1 });
    expect(
      await bridge.setPermissionMode(
        attachmentId,
        0,
        "full",
        "full_access",
        confirm
      )
    ).toEqual(changed);
    expect(await bridge.permissionMode(attachmentId)).toEqual(changed);
    expect((await bridge.permissionMode(other.attachmentId)).mode).toBe(
      "approve_for_me"
    );
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  SideChatPlacement,
  type SideChatPresentation,
} from "./side-chat-placement";
import { FakeSideChatParent } from "./side-chat-placement.fixtures";

function recorder() {
  const presented: SideChatPresentation[] = [];
  const withdrawn = vi.fn<() => void>();
  const placement: SideChatPlacement = {
    present: (presentation) => void presented.push(presentation),
    withdraw: withdrawn,
  };
  return { placement, presented, withdrawn };
}

describe("SideChatPlacement.connect", () => {
  it("presents an opened side chat and withdraws it when it ends", async () => {
    const parent = new FakeSideChatParent();
    const { placement, presented, withdrawn } = recorder();
    const stop = SideChatPlacement.connect(parent, placement);
    expect(presented).toHaveLength(0);

    const side = parent.open();
    expect(presented).toHaveLength(1);
    expect(presented[0]).toMatchObject({ id: side.id, side });

    presented[0].close();
    await vi.waitFor(() => expect(withdrawn).toHaveBeenCalledTimes(1));
    expect(parent.close).toHaveBeenCalledTimes(1);
    stop();
    expect(withdrawn).toHaveBeenCalledTimes(1);
  });

  it("presents an open side chat once until it changes", () => {
    const parent = new FakeSideChatParent();
    const { placement, presented } = recorder();
    SideChatPlacement.connect(parent, placement);
    parent.open();
    parent.set({});
    expect(presented).toHaveLength(1);
    parent.open();
    expect(presented).toHaveLength(2);
  });

  it("withdraws when the parent switches chats and on disconnect", () => {
    const parent = new FakeSideChatParent();
    const { placement, withdrawn } = recorder();
    const stop = SideChatPlacement.connect(parent, placement);
    parent.open();
    parent.set({ sideChat: null });
    expect(withdrawn).toHaveBeenCalledTimes(1);
    parent.open();
    stop();
    expect(withdrawn).toHaveBeenCalledTimes(2);
    parent.set({ sideChat: null });
    expect(withdrawn).toHaveBeenCalledTimes(2);
  });

  it("routes a late close only to the side chat it was presented for", () => {
    const parent = new FakeSideChatParent();
    const { placement, presented } = recorder();
    SideChatPlacement.connect(parent, placement);
    parent.open();
    const stale = presented[0];
    parent.set({ sideChat: null });
    const current = parent.open();
    stale.close();
    expect(parent.close).not.toHaveBeenCalled();
    expect(parent.read().sideChat).toBe(current);
  });
});

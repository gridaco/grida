import { describe, expect, it, vi } from "vitest";
import {
  SideChatPlacement,
  type SideChatPresentation,
} from "./side-chat-placement";
import { FakeSideChatParent, idleBridge } from "./side-chat-placement.fixtures";
import { SideChatInlinePlacement } from "./side-chat-inline-placement";

const host = { bridge: idleBridge };

function recorder() {
  const presented: SideChatPresentation[] = [];
  const withdrawn = vi.fn<(id: string) => void>();
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
    const stop = SideChatPlacement.connect(parent, placement, host);
    expect(presented).toHaveLength(0);

    const side = parent.open();
    expect(presented).toHaveLength(1);
    expect(presented[0]).toMatchObject({
      id: side.id,
      chat: side.chat,
      focus: 1,
      host,
    });

    presented[0].close();
    await vi.waitFor(() =>
      expect(withdrawn).toHaveBeenCalledExactlyOnceWith(side.id)
    );
    expect(parent.close).toHaveBeenCalledExactlyOnceWith(side.id);
    stop();
    expect(withdrawn).toHaveBeenCalledTimes(1);
  });

  it("presents each side chat beside the others and closes only the one asked", async () => {
    const parent = new FakeSideChatParent();
    const { placement, presented, withdrawn } = recorder();
    SideChatPlacement.connect(parent, placement, host);
    const first = parent.open();
    const second = parent.open();
    expect(presented.map(({ id }) => id)).toEqual([first.id, second.id]);
    expect(withdrawn).not.toHaveBeenCalled();

    presented[0].close();
    await vi.waitFor(() =>
      expect(withdrawn).toHaveBeenCalledExactlyOnceWith(first.id)
    );
    expect(parent.read().sideChats.map(({ id }) => id)).toEqual([second.id]);
    expect(presented).toHaveLength(2);
  });

  it("presents a side chat again only when asked to show it", () => {
    const parent = new FakeSideChatParent();
    const { placement, presented } = recorder();
    SideChatPlacement.connect(parent, placement, host);
    const first = parent.open();
    const second = parent.open();
    parent.set({ sideChats: parent.read().sideChats });
    expect(presented).toHaveLength(2);
    parent.show(first.id);
    expect(presented).toHaveLength(3);
    expect(presented[2]).toMatchObject({ id: first.id, focus: 2 });
    parent.show(second.id);
    expect(presented[3]).toMatchObject({ id: second.id, focus: 2 });
  });

  it("withdraws every side chat when the parent switches chats and on disconnect", () => {
    const parent = new FakeSideChatParent();
    const { placement, withdrawn } = recorder();
    const stop = SideChatPlacement.connect(parent, placement, host);
    const first = parent.open();
    const second = parent.open();
    parent.switchChat();
    expect(withdrawn.mock.calls).toEqual([[first.id], [second.id]]);
    const third = parent.open();
    stop();
    expect(withdrawn).toHaveBeenLastCalledWith(third.id);
    parent.switchChat();
    expect(withdrawn).toHaveBeenCalledTimes(3);
  });

  it("routes a late close only to the side chat it was presented for", () => {
    const parent = new FakeSideChatParent();
    const { placement, presented } = recorder();
    SideChatPlacement.connect(parent, placement, host);
    parent.open();
    const stale = presented[0];
    parent.switchChat();
    const current = parent.open();
    stale.close();
    expect(parent.close).not.toHaveBeenCalled();
    expect(parent.read().sideChats).toEqual([current]);
  });
});

describe("SideChatInlinePlacement", () => {
  it("shows the side chat opened or shown last and the one before when it closes", async () => {
    const parent = new FakeSideChatParent();
    const inline = new SideChatInlinePlacement();
    SideChatPlacement.connect(parent, inline, host);
    expect(inline.read()).toBeNull();
    const first = parent.open();
    const second = parent.open();
    expect(inline.read()?.id).toBe(second.id);
    parent.show(first.id);
    expect(inline.read()).toMatchObject({ id: first.id, focus: 2 });
    await parent.closeSideChat(first.id);
    expect(inline.read()?.id).toBe(second.id);
    parent.switchChat();
    expect(inline.read()).toBeNull();
  });
});

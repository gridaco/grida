import { describe, expect, it, vi } from "vitest";
import {
  SideChatPlacement,
  type SideChatPresentation,
} from "./side-chat-placement";
import { FakeSideChatParent, idleBridge } from "./side-chat-placement.fixtures";

const host = { bridge: idleBridge };

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
    await vi.waitFor(() => expect(withdrawn).toHaveBeenCalledTimes(1));
    expect(parent.close).toHaveBeenCalledTimes(1);
    stop();
    expect(withdrawn).toHaveBeenCalledTimes(1);
  });

  it("presents the same side chat again only when asked to show it", () => {
    const parent = new FakeSideChatParent();
    const { placement, presented } = recorder();
    SideChatPlacement.connect(parent, placement, host);
    const side = parent.open();
    parent.set({ sideChat: side });
    expect(presented).toHaveLength(1);
    parent.show();
    expect(presented).toHaveLength(2);
    expect(presented[1]).toMatchObject({ id: side.id, focus: 2 });
    parent.open();
    expect(presented).toHaveLength(3);
    expect(presented[2].id).not.toBe(side.id);
  });

  it("withdraws when the parent switches chats and on disconnect", () => {
    const parent = new FakeSideChatParent();
    const { placement, withdrawn } = recorder();
    const stop = SideChatPlacement.connect(parent, placement, host);
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
    SideChatPlacement.connect(parent, placement, host);
    parent.open();
    const stale = presented[0];
    parent.set({ sideChat: null });
    const current = parent.open();
    stale.close();
    expect(parent.close).not.toHaveBeenCalled();
    expect(parent.read().sideChat).toBe(current);
  });
});

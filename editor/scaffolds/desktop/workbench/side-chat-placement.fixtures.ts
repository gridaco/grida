import { vi } from "vitest";
import { NativeSideChatController } from "@/lib/agent-chat/native-side-chat-controller";
import type { SideChatPlacement } from "./side-chat-placement";

/** A parent chat reduced to the side chat state a placement follows. */
export class FakeSideChatParent implements SideChatPlacement.Parent {
  private view: ReturnType<SideChatPlacement.Parent["read"]> = {
    sideChat: null,
  };
  private readonly listeners = new Set<() => void>();
  readonly close = vi.fn<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  read = () => this.view;

  /** Open a side chat, as `/side` does. */
  open(): NativeSideChatController {
    const side = new NativeSideChatController(
      {
        openSideChat: async () => ({
          sourceRevision: 1,
          compacted: false,
          truncated: false,
          omitted: false,
        }),
        askSideChat: async (_parent, _open, _request, text) => ({
          turnId: `answer-${text}`,
          status: "succeeded",
          text: `About ${text}`,
          textTruncated: false,
        }),
        closeSideChat: async () => {},
      },
      "parent-attachment"
    );
    this.set({ sideChat: side });
    return side;
  }

  set(change: Partial<ReturnType<SideChatPlacement.Parent["read"]>>): void {
    this.view = { ...this.view, ...change };
    for (const listener of this.listeners) listener();
  }

  async closeSideChat(): Promise<void> {
    this.close();
    await this.view.sideChat?.close();
    this.set({ sideChat: null });
  }
}

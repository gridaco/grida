import { vi } from "vitest";
import type { DesktopNativeChat } from "@grida/desktop-bridge";
import {
  NativeChatController,
  type NativeChatView,
} from "@/lib/agent-chat/native-chat-controller";
import type { SideChatPlacement } from "./side-chat-placement";

/** A bridge with nothing behind it; placement tests never send. */
export const idleBridge = {} as DesktopNativeChat;

/** A parent chat reduced to the side chat state a placement follows. */
export class FakeSideChatParent implements SideChatPlacement.Parent {
  private view: Pick<NativeChatView, "sideChat"> = { sideChat: null };
  private readonly listeners = new Set<() => void>();
  private next = 0;
  readonly close = vi.fn<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  read = () => this.view;

  /** Open a side chat, as `/side` does. */
  open(): NonNullable<NativeChatView["sideChat"]> {
    const side = {
      id: `side-${++this.next}`,
      chat: new NativeChatController(
        idleBridge,
        undefined,
        undefined,
        undefined,
        false,
        {
          open: async () => ({
            attachmentId: "side-attachment",
            sessionId: "side/session",
          }),
          effort: "medium",
          profiles: null,
        }
      ),
      focus: 1,
    };
    this.set({ sideChat: side });
    return side;
  }

  /** Ask to show the open side chat again, as `/side` does while it is open. */
  show(): void {
    const side = this.view.sideChat;
    if (side) this.set({ sideChat: { ...side, focus: side.focus + 1 } });
  }

  set(change: Partial<Pick<NativeChatView, "sideChat">>): void {
    this.view = { ...this.view, ...change };
    for (const listener of this.listeners) listener();
  }

  async closeSideChat(): Promise<void> {
    this.close();
    await Promise.resolve();
    this.set({ sideChat: null });
  }
}

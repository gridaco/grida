import { vi } from "vitest";
import type { DesktopNativeChat } from "@grida/desktop-bridge";
import {
  NativeChatController,
  SIDE_CHAT_TITLE,
  type NativeChatSideChat,
  type NativeChatView,
} from "@/lib/agent-chat/native-chat-controller";
import type { SideChatPlacement } from "./side-chat-placement";

/** A bridge with nothing behind it; placement tests never send. */
export const idleBridge = {} as DesktopNativeChat;

/** A side chat that is never opened; placement tests only show it. */
export function idleSideChat(): NativeChatController {
  return new NativeChatController(
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
  );
}

/**
 * The part of a side chat a placement reads for its title, with the title
 * arriving when the test says, as the host's would through the snapshot.
 */
export class TitledSideChat {
  private title: string | null = null;
  private view: Pick<NativeChatView, "messages"> = { messages: [] };
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  sideChatTitle = () => this.title ?? SIDE_CHAT_TITLE;
  read = () => this.view;

  messages(messages: NativeChatView["messages"]): void {
    this.view = { messages };
    for (const listener of this.listeners) listener();
  }

  arrive(title: string): void {
    this.title = title;
    for (const listener of this.listeners) listener();
  }

  get listening(): number {
    return this.listeners.size;
  }
}

/** A parent chat reduced to the side chat state a placement follows. */
export class FakeSideChatParent implements SideChatPlacement.Parent {
  private view: Pick<NativeChatView, "sideChats"> = { sideChats: [] };
  private readonly listeners = new Set<() => void>();
  private next = 0;
  readonly close = vi.fn<(id: string) => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  read = () => this.view;

  /** Open another side chat, as `/side` with text does. */
  open(chat: NativeChatController = idleSideChat()): NativeChatSideChat {
    const side = { id: `side-${++this.next}`, chat, focus: 1 };
    this.set({ sideChats: [...this.view.sideChats, side] });
    return side;
  }

  /** Ask to show side chat `id` again, as `/side` alone does. */
  show(id: string): void {
    this.set({
      sideChats: this.view.sideChats.map((side) =>
        side.id === id ? { ...side, focus: side.focus + 1 } : side
      ),
    });
  }

  /** End every side chat, as switching chats does. */
  switchChat(): void {
    this.set({ sideChats: [] });
  }

  set(change: Partial<Pick<NativeChatView, "sideChats">>): void {
    this.view = { ...this.view, ...change };
    for (const listener of this.listeners) listener();
  }

  async closeSideChat(id: string): Promise<void> {
    this.close(id);
    await Promise.resolve();
    this.set({
      sideChats: this.view.sideChats.filter((side) => side.id !== id),
    });
  }
}

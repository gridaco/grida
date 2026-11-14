import type { NativeChatView } from "@/lib/agent-chat/native-chat-controller";
import type { NativeSideChatController } from "@/lib/agent-chat/native-side-chat-controller";

/**
 * Where an open side chat is presented: the seam between a chat and the
 * surface that shows its side chat.
 *
 * Three layers, each depending only on the one before it:
 *
 * 1. **Core** — `NativeChatController` owns the side chat's lifecycle
 *    (`sideChat`, `closeSideChat`) and knows nothing about
 *    tabs, panes or windows.
 * 2. **Content** — `NativeSideChatView` renders one side chat and its actions
 *    and fills whatever container it is given.
 * 3. **Placement** — a {@link SideChatPlacement} puts that content on a
 *    concrete surface: `SideChatTabPlacement` as a workbench tab,
 *    `SideChatInlinePlacement` inline in the file window.
 *
 * {@link SideChatPlacement.connect} is the only wire between core and
 * placement. It presents the parent's open side chat and withdraws it when
 * the side chat ends: closed, the
 * chat switched, detached or released. A placement maps its surface's own
 * dismissal back by calling the presentation's `close`.
 *
 * Showing side chats somewhere else (a floating surface, another window) is a
 * new `SideChatPlacement` implementation handed to the chat's host; the core
 * and the content view do not change.
 */
export interface SideChatPlacement {
  /**
   * Show a side chat, or update the one shown. A presentation with a new `id`
   * is a new side chat and replaces any earlier one.
   */
  present(presentation: SideChatPresentation): void;
  /** The side chat ended; remove its surface. */
  withdraw(): void;
}

/** One open side chat with the parent-owned actions its content offers. */
export type SideChatPresentation = Readonly<{
  /** Stable for one side chat; a later side chat has a new id. */
  id: string;
  side: NativeSideChatController;
  /** End this side chat through its parent chat. */
  close: () => void;
}>;

export namespace SideChatPlacement {
  /** The part of a parent chat (`NativeChatController`) a placement follows. */
  export type Parent = Readonly<{
    subscribe(listener: () => void): () => void;
    read(): Pick<NativeChatView, "sideChat">;
    closeSideChat(): Promise<void>;
  }>;

  /**
   * Keep `placement` in step with `parent`'s side chat until the returned
   * function runs, which withdraws anything still shown.
   */
  export function connect(
    parent: Parent,
    placement: SideChatPlacement
  ): () => void {
    let shown: SideChatPresentation | null = null;
    const withdraw = () => {
      if (!shown) return;
      shown = null;
      placement.withdraw();
    };
    const sync = () => {
      const view = parent.read();
      const side = view.sideChat;
      if (!side) return withdraw();
      if (shown?.side === side) return;
      shown = {
        id: side.id,
        side,
        // A surface closing late must not end a newer side chat.
        close: () => {
          if (parent.read().sideChat === side) void parent.closeSideChat();
        },
      };
      placement.present(shown);
    };
    const unsubscribe = parent.subscribe(sync);
    sync();
    return () => {
      unsubscribe();
      withdraw();
    };
  }
}

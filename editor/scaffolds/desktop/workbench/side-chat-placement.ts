import type { DesktopNativeChat } from "@grida/desktop-bridge";
import type {
  NativeChatController,
  NativeChatEditorSurfaces,
  NativeChatView,
} from "@/lib/agent-chat/native-chat-controller";

/**
 * Where an open side chat is presented: the seam between a chat and the
 * surface that shows its side chat.
 *
 * Three layers, each depending only on the one before it:
 *
 * 1. **Core** — `NativeChatController` opens the side chat (`openSideChat`,
 *    `closeSideChat`) as another `NativeChatController` bound to the side
 *    session, and knows nothing about tabs, panes or windows.
 * 2. **Content** — `NativeSideChatPane` renders that chat with the same pane
 *    as any chat and fills whatever container it is given.
 * 3. **Placement** — a {@link SideChatPlacement} puts that content on a
 *    concrete surface: `SideChatTabPlacement` as a workbench tab,
 *    `SideChatInlinePlacement` inline in the file window.
 *
 * {@link SideChatPlacement.connect} is the only wire between core and
 * placement. It presents the parent's open side chat, presents it again each
 * time it is asked to show, and withdraws it when the side chat ends: closed,
 * the chat switched, detached or released. A placement maps its surface's own
 * dismissal back by calling the presentation's `close`.
 *
 * Showing side chats somewhere else (a floating surface, another window) is a
 * new `SideChatPlacement` implementation handed to the chat's host; the core
 * and the content do not change.
 */
export interface SideChatPlacement {
  /**
   * Show a side chat, or update the one shown. A presentation with a new `id`
   * is a new side chat and replaces any earlier one; the same `id` with a new
   * `focus` asks to bring it forward.
   */
  present(presentation: SideChatPresentation): void;
  /** The side chat ended; remove its surface. */
  withdraw(): void;
}

/** One open side chat with what its content needs. */
export type SideChatPresentation = Readonly<{
  /** Stable for one side chat; a later side chat has a new id. */
  id: string;
  /** The side chat: an ordinary chat bound to the side session. */
  chat: NativeChatController;
  /** Grows each time the side chat is asked to show. */
  focus: number;
  host: SideChatPlacement.Host;
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

  /** What the parent chat's pane lends the side chat's content. */
  export type Host = Readonly<{
    bridge: DesktopNativeChat;
    workspaceId?: string;
    editorSurfaces?: NativeChatEditorSurfaces;
  }>;

  /**
   * Keep `placement` in step with `parent`'s side chat until the returned
   * function runs, which withdraws anything still shown.
   */
  export function connect(
    parent: Parent,
    placement: SideChatPlacement,
    host: Host
  ): () => void {
    let shown: NativeChatView["sideChat"] = null;
    const withdraw = () => {
      if (!shown) return;
      shown = null;
      placement.withdraw();
    };
    const sync = () => {
      const side = parent.read().sideChat;
      if (!side) return withdraw();
      if (shown === side) return;
      shown = side;
      placement.present({
        id: side.id,
        chat: side.chat,
        focus: side.focus,
        host,
        // A surface closing late must not end a newer side chat.
        close: () => {
          if (parent.read().sideChat?.id === side.id)
            void parent.closeSideChat();
        },
      });
    };
    const unsubscribe = parent.subscribe(sync);
    sync();
    return () => {
      unsubscribe();
      withdraw();
    };
  }
}

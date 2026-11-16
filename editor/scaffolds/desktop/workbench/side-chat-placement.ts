import type { DesktopNativeChat } from "@grida/desktop-bridge";
import type {
  NativeChatController,
  NativeChatEditorSurfaces,
  NativeChatSideChat,
  NativeChatView,
} from "@/lib/agent-chat/native-chat-controller";

/**
 * Where a chat's open side chats are presented: the seam between a chat and
 * the surface that shows its side chats.
 *
 * Three layers, each depending only on the one before it:
 *
 * 1. **Core** — `NativeChatController` opens side chats (`openSideChat`,
 *    `showSideChat`, `closeSideChat`), each as another `NativeChatController`
 *    bound to its own side session, and knows nothing about tabs, panes or
 *    windows.
 * 2. **Content** — `NativeSideChatPane` renders one side chat with the same
 *    pane as any chat and fills whatever container it is given.
 * 3. **Placement** — a {@link SideChatPlacement} puts that content on a
 *    concrete surface: `SideChatTabPlacement` as one workbench tab per side
 *    chat, `SideChatInlinePlacement` inline in the file window.
 *
 * {@link SideChatPlacement.connect} is the only wire between core and
 * placement. It presents each of the parent's open side chats, presents one
 * again each time it is asked to show, and withdraws each one that ends:
 * closed, or every one when the chat is switched, detached or released. A
 * placement maps its surface's own dismissal back by calling that
 * presentation's `close`, which ends only that side chat.
 *
 * Showing side chats somewhere else (a floating surface, another window) is a
 * new `SideChatPlacement` implementation handed to the chat's host; the core
 * and the content do not change.
 */
export interface SideChatPlacement {
  /**
   * Show a side chat, or update the one shown with the same `id`. A new `id`
   * is another side chat shown beside the others; the same `id` with a new
   * `focus` asks to bring it forward.
   */
  present(presentation: SideChatPresentation): void;
  /** Side chat `id` ended; remove its surface. */
  withdraw(id: string): void;
}

/** One open side chat with what its content needs. */
export type SideChatPresentation = Readonly<{
  /** Stable for one side chat; every side chat has its own id. */
  id: string;
  /** The side chat: an ordinary chat bound to its side session. */
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
    read(): Pick<NativeChatView, "sideChats">;
    closeSideChat(id: string): Promise<void>;
  }>;

  /** What the parent chat's pane lends the side chat's content. */
  export type Host = Readonly<{
    bridge: DesktopNativeChat;
    workspaceId?: string;
    editorSurfaces?: NativeChatEditorSurfaces;
  }>;

  /**
   * Keep `placement` in step with `parent`'s side chats until the returned
   * function runs, which withdraws everything still shown.
   */
  export function connect(
    parent: Parent,
    placement: SideChatPlacement,
    host: Host
  ): () => void {
    const shown = new Map<string, NativeChatSideChat>();
    const sync = () => {
      const sides = parent.read().sideChats;
      const open = new Set(sides.map((side) => side.id));
      for (const id of shown.keys()) {
        if (open.has(id)) continue;
        shown.delete(id);
        placement.withdraw(id);
      }
      for (const side of sides) {
        if (shown.get(side.id) === side) continue;
        shown.set(side.id, side);
        placement.present({
          id: side.id,
          chat: side.chat,
          focus: side.focus,
          host,
          // A surface closing late must not end anything else.
          close: () => {
            if (parent.read().sideChats.some(({ id }) => id === side.id))
              void parent.closeSideChat(side.id);
          },
        });
      }
    };
    const unsubscribe = parent.subscribe(sync);
    sync();
    return () => {
      unsubscribe();
      for (const id of shown.keys()) {
        shown.delete(id);
        placement.withdraw(id);
      }
    };
  }
}

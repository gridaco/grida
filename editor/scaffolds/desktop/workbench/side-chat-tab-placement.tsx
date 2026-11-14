import { MessageSquareTextIcon } from "lucide-react";
import { NativeSideChatPane } from "./native-agent-pane";
import type {
  SideChatPlacement,
  SideChatPresentation,
} from "./side-chat-placement";
import type { WorkbenchPanels } from "./workbench-panels";

/**
 * Presents each side chat as its own tab in the workbench's editor group.
 *
 * A side chat that opens becomes a focused tab titled **Side chat** until the
 * host titles it, then by that title; asking to show it again (`/side` alone
 * when it is the side chat used last) brings its tab forward. Closing a tab
 * ends that side chat only, through its parent; a side chat that ends
 * elsewhere closes its tab. A closed side chat tab is not reopenable, because
 * the side chat itself has ended. See test/desktop-agent-chat-side-chat-tab.md.
 */
export class SideChatTabPlacement implements SideChatPlacement {
  private readonly shown = new Map<
    string,
    { presentation: SideChatPresentation; title: string; stop: () => void }
  >();
  /** Side chats whose tab was closed while they are still ending. */
  private readonly dismissed = new Set<string>();

  constructor(
    private readonly panels: Pick<
      WorkbenchPanels,
      "show" | "reveal" | "withdraw"
    >
  ) {}

  present(presentation: SideChatPresentation): void {
    const { id, chat } = presentation;
    if (this.dismissed.has(id)) return;
    const known = this.shown.get(id);
    known?.stop();
    const entry = {
      presentation,
      title: chat.sideChatTitle(),
      // The tab follows the side chat's title as it arrives.
      stop: chat.subscribe(() => {
        if (this.shown.get(id) !== entry) return;
        const title = chat.sideChatTitle();
        if (title === entry.title) return;
        entry.title = title;
        this.show(entry);
      }),
    };
    this.shown.set(id, entry);
    this.show(entry);
    if (known) this.panels.reveal(SideChatTabPlacement.panel(id));
  }

  withdraw(id: string): void {
    this.dismissed.delete(id);
    const entry = this.shown.get(id);
    if (!entry) return;
    entry.stop();
    this.shown.delete(id);
    this.panels.withdraw(SideChatTabPlacement.panel(id));
  }

  private show(entry: {
    presentation: SideChatPresentation;
    title: string;
    stop: () => void;
  }): void {
    const { presentation, title } = entry;
    const { id } = presentation;
    this.panels.show(
      SideChatTabPlacement.panel(id),
      {
        title,
        icon: <MessageSquareTextIcon />,
        content: <NativeSideChatPane presentation={presentation} />,
      },
      () => {
        entry.stop();
        this.shown.delete(id);
        this.dismissed.add(id);
        presentation.close();
      }
    );
  }

  /** The panel id of a side chat's tab. */
  static panel(id: string): string {
    return `side-chat/${id}`;
  }
}

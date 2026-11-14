import { MessageSquareTextIcon } from "lucide-react";
import { NativeSideChatPane } from "./native-agent-pane";
import type {
  SideChatPlacement,
  SideChatPresentation,
} from "./side-chat-placement";
import type { WorkbenchPanels } from "./workbench-panels";

/**
 * Presents a side chat as a tab in the workbench's editor group.
 *
 * A side chat that opens becomes a focused **Side chat** tab; asking to show
 * it again (`/side` while it is open) brings the tab forward. Closing the tab
 * ends the side chat through its parent; a side chat that ends elsewhere
 * closes its tab. A closed side chat tab is not reopenable, because the side
 * chat itself has ended. See test/desktop-agent-chat-side-chat-tab.md.
 */
export class SideChatTabPlacement implements SideChatPlacement {
  private shown?: string;
  /** A side chat whose tab was closed while it is still ending. */
  private dismissed?: string;

  constructor(
    private readonly panels: Pick<
      WorkbenchPanels,
      "show" | "reveal" | "withdraw"
    >
  ) {}

  present(presentation: SideChatPresentation): void {
    const { id } = presentation;
    if (id === this.dismissed) return;
    const known = this.shown === id;
    if (!known) {
      this.withdraw();
      this.shown = id;
    }
    const panel = SideChatTabPlacement.panel(id);
    this.panels.show(
      panel,
      {
        title: "Side chat",
        icon: <MessageSquareTextIcon />,
        content: <NativeSideChatPane presentation={presentation} />,
      },
      () => {
        this.shown = undefined;
        this.dismissed = id;
        presentation.close();
      }
    );
    if (known) this.panels.reveal(panel);
  }

  withdraw(): void {
    const shown = this.shown;
    this.shown = undefined;
    this.dismissed = undefined;
    if (shown) this.panels.withdraw(SideChatTabPlacement.panel(shown));
  }

  /** The panel id of a side chat's tab. */
  static panel(id: string): string {
    return `side-chat/${id}`;
  }
}

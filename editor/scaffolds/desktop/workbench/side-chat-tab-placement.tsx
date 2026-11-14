import { MessageSquareTextIcon } from "lucide-react";
import { NativeSideChatView } from "./native-side-chat-view";
import type {
  SideChatPlacement,
  SideChatPresentation,
} from "./side-chat-placement";
import type { WorkbenchPanels } from "./workbench-panels";

/**
 * Presents a side chat as a tab in the workbench's editor group.
 *
 * A side chat that opens becomes a focused **Side chat** tab; a question asked
 * while another tab is in front brings it forward again. Closing the tab ends
 * the side chat through its parent; a side chat that ends elsewhere closes its
 * tab. A closed side chat tab is not reopenable, because the side chat itself
 * has ended. See test/desktop-agent-chat-side-chat-tab.md.
 */
export class SideChatTabPlacement implements SideChatPlacement {
  private shown?: Readonly<{ id: string; stopReveal: () => void }>;
  /** A side chat whose tab was closed while it is still ending. */
  private dismissed?: string;

  constructor(
    private readonly panels: Pick<
      WorkbenchPanels,
      "show" | "reveal" | "withdraw"
    >
  ) {}

  present(presentation: SideChatPresentation): void {
    const { id, side } = presentation;
    if (id === this.dismissed) return;
    if (this.shown?.id !== id) {
      this.withdraw();
      let asking = side.read().asking;
      const stopReveal = side.subscribe(() => {
        const now = side.read().asking;
        if (now && !asking) this.panels.reveal(SideChatTabPlacement.panel(id));
        asking = now;
      });
      this.shown = { id, stopReveal };
    }
    this.panels.show(
      SideChatTabPlacement.panel(id),
      {
        title: "Side chat",
        icon: <MessageSquareTextIcon />,
        content: <NativeSideChatView {...presentation} />,
      },
      () => {
        this.release();
        this.dismissed = id;
        presentation.close();
      }
    );
  }

  withdraw(): void {
    const shown = this.shown;
    this.release();
    this.dismissed = undefined;
    if (shown) this.panels.withdraw(SideChatTabPlacement.panel(shown.id));
  }

  private release(): void {
    this.shown?.stopReveal();
    this.shown = undefined;
  }

  /** The panel id of a side chat's tab. */
  static panel(id: string): string {
    return `side-chat/${id}`;
  }
}

import { BotIcon } from "lucide-react";
import { NativeSubagentActivity } from "./native-agent-activity";
import type { SubagentPlacement } from "./subagent-placement";
import type { WorkbenchPanels } from "./workbench-panels";

/** Presents the selected parent chat's read-only Subagents view as one content tab. */
export class SubagentTabPlacement implements SubagentPlacement {
  private shown?: { presentation: SubagentPlacement.Presentation };

  constructor(
    private readonly panels: Pick<
      WorkbenchPanels,
      "show" | "reveal" | "withdraw"
    >
  ) {}

  present(presentation: SubagentPlacement.Presentation): void {
    const known = this.shown;
    if (
      known?.presentation.controller === presentation.controller &&
      known.presentation.focus === presentation.focus
    ) {
      known.presentation = presentation;
      return;
    }
    const entry = { presentation };
    this.shown = entry;
    this.panels.show(
      SubagentTabPlacement.panel,
      {
        title: "Subagents",
        icon: <BotIcon />,
        content: (
          <section
            data-testid="subagent-tab-content"
            aria-label="Subagent activity"
            className="h-full min-h-0 overflow-hidden py-4"
          >
            <NativeSubagentActivity
              controller={presentation.controller}
              heading={false}
            />
          </section>
        ),
      },
      () => {
        if (this.shown !== entry) return;
        this.shown = undefined;
        entry.presentation.close();
      }
    );
    if (known) this.panels.reveal(SubagentTabPlacement.panel);
  }

  /** Losing the parent or attachment removes the view without stopping child work. */
  withdraw(): void {
    this.shown = undefined;
    this.panels.withdraw(SubagentTabPlacement.panel);
  }

  static readonly panel = "subagents";
}

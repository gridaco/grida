"use client";

import { type ReactNode, useSyncExternalStore } from "react";
import { WorkbenchPanels } from "@/scaffolds/desktop/workbench/workbench-panels";
import { EditorGroup } from "@/scaffolds/desktop/workbench/editor-group";
import { WorkbenchTab } from "@/scaffolds/desktop/workbench/workbench-tab";
import { SideChatTabPlacement } from "@/scaffolds/desktop/workbench/side-chat-tab-placement";
import { SubagentTabPlacement } from "@/scaffolds/desktop/workbench/subagent-tab-placement";
import { Button } from "@app/ui/components/button";
import { XIcon } from "lucide-react";

export class NativeChatDemoPanels {
  readonly group = new EditorGroup({ reopenable: WorkbenchTab.reopenable });
  readonly panels = new WorkbenchPanels(this.group);
  readonly sideChats = new SideChatTabPlacement(this.panels);
  readonly subagents = new SubagentTabPlacement(this.panels);
}

export function NativeChatDemoPanelLayout({
  host: { group, panels },
  children,
}: {
  host: NativeChatDemoPanels;
  children: ReactNode;
}) {
  const { active, tabs } = useSyncExternalStore(
    group.subscribe,
    group.getSnapshot,
    group.getSnapshot
  );
  const shown = useSyncExternalStore(
    panels.subscribe,
    panels.getSnapshot,
    panels.getSnapshot
  );
  const panel = (tab: string) => {
    const key = WorkbenchTab.parse(tab);
    return key.kind === "panel" ? shown.get(key.id) : undefined;
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {active && (
        <section
          aria-label="Chat panels"
          className="flex min-h-0 min-w-0 basis-1/2 flex-1 flex-col border-r"
        >
          <div
            className="flex shrink-0 flex-wrap items-center gap-1 border-b px-1 py-1"
            aria-label="Open chat panels"
          >
            {tabs.map((tab) => {
              const title = panel(tab)?.title;
              if (!title) return null;
              return (
                <div key={tab} className="flex items-center">
                  <Button
                    variant={active === tab ? "secondary" : "ghost"}
                    size="sm"
                    aria-pressed={active === tab}
                    onClick={() => group.activate(tab)}
                  >
                    {title}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Close ${title}`}
                    onClick={() => group.close(tab)}
                  >
                    <XIcon className="size-3" />
                  </Button>
                </div>
              );
            })}
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {panel(active)?.content}
          </div>
        </section>
      )}
      <div className="flex min-h-0 min-w-0 basis-1/2 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}

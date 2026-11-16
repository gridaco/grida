"use client";

import { useSyncExternalStore } from "react";
import { ListTreeIcon, TerminalIcon, XIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@app/ui/components/tabs";
import type { Workspace } from "@/lib/desktop/bridge";
import type { NativeBackgroundProcessController } from "@/lib/agent-chat/native-background-process-controller";
import { NativeBackgroundProcessList } from "./native-background-processes";
import { TerminalPane } from "./terminal-pane";
import { WorkspaceUtilities } from "./workspace-utilities";

/** Terminal and selected-chat processes share a panel, not execution ownership. */
export function WorkspaceUtilitiesPanel({
  workspace,
  utilities,
  processes,
  supportsTerminal,
  onClose,
}: {
  workspace: Workspace;
  utilities: WorkspaceUtilities;
  processes: NativeBackgroundProcessController | null;
  supportsTerminal: boolean;
  onClose: () => void;
}) {
  const view = useSyncExternalStore(
    utilities.subscribe,
    utilities.read,
    utilities.read
  );
  return (
    <section
      data-testid="workspace-utilities-panel"
      aria-label="Workspace utilities"
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <Tabs
        value={view.activeTab}
        onValueChange={(tab) => {
          if (tab === "terminal" || tab === "processes") utilities.show(tab);
        }}
        className="h-full min-h-0 gap-0"
      >
        <header className="flex shrink-0 items-center gap-2 border-b px-2">
          <TabsList
            variant="line"
            aria-label="Workspace utilities"
            className="h-9"
          >
            <TabsTrigger
              value="terminal"
              disabled={!supportsTerminal}
              className="text-xs"
            >
              <TerminalIcon className="size-3.5" />
              Terminal
            </TabsTrigger>
            <TabsTrigger
              value="processes"
              className="text-xs"
              title="Processes from the selected chat"
            >
              <ListTreeIcon className="size-3.5" />
              Processes
            </TabsTrigger>
          </TabsList>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            aria-label="Close workspace utilities"
            title="Close panel"
            onClick={onClose}
          >
            <XIcon className="size-3.5" />
          </Button>
        </header>
        <TabsContent
          value="terminal"
          forceMount
          inert={view.activeTab !== "terminal"}
          className="min-h-0 data-[state=inactive]:hidden"
        >
          {view.terminalMounted && supportsTerminal ? (
            <TerminalPane
              workspace={workspace}
              embedded
              active={view.activeTab === "terminal"}
              onSessionEnded={utilities.terminalEnded}
            />
          ) : (
            <div className="flex h-full items-center justify-center gap-3 p-3 text-xs text-muted-foreground">
              <p>
                {supportsTerminal
                  ? "Terminal session ended."
                  : "Terminal is unavailable in this Desktop build."}
              </p>
              {supportsTerminal && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => utilities.show("terminal")}
                >
                  Start terminal
                </Button>
              )}
            </div>
          )}
        </TabsContent>
        <TabsContent value="processes" className="min-h-0 overflow-y-auto p-2">
          {processes ? (
            <NativeBackgroundProcessList
              controller={processes}
              expanded
              heading={false}
            />
          ) : (
            <p className="px-2 py-4 text-xs text-muted-foreground">
              Processes unavailable for this chat.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}

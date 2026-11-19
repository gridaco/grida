"use client";

import { useState, useSyncExternalStore } from "react";
import { BotIcon, MessageSquareTextIcon } from "lucide-react";
import type { NativeChatMessage } from "@grida/desktop-bridge";
import { Button } from "@app/ui/components/button";
import { cn } from "@app/ui/lib/utils";
import { MacOSWindow } from "@/components/frames/macos-desktop";
import type { Workspace } from "@/lib/desktop/bridge";
import { EditorGroup } from "@/scaffolds/desktop/workbench/editor-group";
import { EditorTitleBar } from "@/scaffolds/desktop/workbench/editor-pane";
import { ChatTabPreviewContent } from "@/scaffolds/desktop/workbench/editor-tab-chat-preview";
import { WorkbenchPanels } from "@/scaffolds/desktop/workbench/workbench-panels";
import { WorkbenchTab } from "@/scaffolds/desktop/workbench/workbench-tab";
import { WorkspaceBrowserTabs } from "@/scaffolds/desktop/workbench/workspace-browser-tabs";
import { DesktopConversation } from "../composer/desktop-conversation";
import { DesktopConversationFixtures } from "../composer/desktop-conversation-fixtures";
import { DesktopComposerFixtures } from "../composer/desktop-fixtures";

const workspace: Workspace = {
  id: "workspace-tabs-demo",
  root: "/fixture/workspace",
  name: "Design project",
  opened_at: 0,
  pinned: false,
};

const files = ["Art direction.md", "Release checklist.md", "Notes.txt"];
const dirtyPaths = new Set(["Notes.txt"]);
const resetHint = "Use Reset tabs to restore the examples.";
const browser = {
  id: "reference",
  url: "https://example.com/",
  page: null,
  error: null,
  locationRevision: 0,
} satisfies WorkspaceBrowserTabs.Entry;
const browserEntries = new Map([[browser.id, browser]]);
const chatExamples: readonly {
  id: string;
  title: string;
  messages: readonly NativeChatMessage[];
}[] = [
  {
    id: "current",
    title: "Current chat",
    messages: DesktopConversationFixtures.get("text").messages,
  },
  {
    id: "waiting",
    title: "Waiting for reply",
    messages: [
      {
        messageId: "tab-waiting",
        role: "user",
        text: "Please check the spacing between the model picker and Send. Keep the composer compact in the narrow layout.",
      },
    ],
  },
  {
    id: "image",
    title: "Image reference",
    messages: [
      {
        messageId: "tab-image-user",
        role: "user",
        text: "",
        attachments: [DesktopComposerFixtures.image],
      },
      {
        messageId: "tab-image-answer",
        role: "assistant",
        text: "I’ll use the attached image to compare spacing, alignment, and rounded corners.",
      },
    ],
  },
  { id: "empty", title: "New chat", messages: [] },
];

function createChatFixture() {
  const group = new EditorGroup({ reopenable: WorkbenchTab.reopenable });
  const panels = new WorkbenchPanels(group);
  for (const { id, title, messages } of chatExamples) {
    panels.show(
      id,
      {
        title,
        icon: <MessageSquareTextIcon />,
        content: (
          <DesktopConversation
            key={id}
            messages={messages}
            scenario={messages.length ? "text" : "empty"}
            running={false}
          />
        ),
        preview: <ChatTabPreviewContent title={title} messages={messages} />,
      },
      () => {}
    );
  }
  group.activate(WorkbenchTab.panel(chatExamples[0].id));
  return { group, panels, browsers: undefined };
}

function createFixture() {
  const group = new EditorGroup({ reopenable: WorkbenchTab.reopenable });
  const panels = new WorkbenchPanels(group);
  group.open(WorkbenchTab.file(files[0]));
  group.open(WorkbenchTab.browser(browser.id));
  group.open(WorkbenchTab.file(files[1]));
  panels.show(
    "review",
    {
      title: "Design review",
      icon: <MessageSquareTextIcon />,
      content: "Compare the two directions before sharing the final draft.",
      preview: <p className="px-3 py-2 text-sm">Design review conversation</p>,
    },
    () => {}
  );
  group.open(WorkbenchTab.file(files[2]));
  panels.show(
    "subagents",
    {
      title: "Subagents",
      icon: <BotIcon />,
      content: "The layout review is complete.",
      preview: <p className="px-3 py-2 text-sm">Layout review · Done</p>,
    },
    () => {}
  );
  group.activate(WorkbenchTab.file(files[0]));
  return {
    group,
    panels,
    browsers: new WorkspaceBrowserTabs(workspace.id, group),
  };
}

export default function WorkspaceTabsPage() {
  const [narrow, setNarrow] = useState(false);
  const [reset, setReset] = useState(0);
  const frameClassName = cn(
    "mx-auto border-border bg-background shadow-sm",
    narrow && "max-w-sm"
  );

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Workspace tabs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag tabs to reorder. Narrow the window to try scrolling at the
            edge.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={narrow ? "secondary" : "outline"}
            aria-pressed={narrow}
            onClick={() => setNarrow((value) => !value)}
          >
            Narrow window
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReset((value) => value + 1)}
          >
            Reset tabs
          </Button>
        </div>
      </div>
      <MacOSWindow
        role="group"
        aria-label="Mixed workspace tabs"
        title={workspace.name}
        className={frameClassName}
      >
        <WorkspaceTabsDemo key={reset} createDemo={createFixture} />
      </MacOSWindow>
      <p className="text-center text-xs text-muted-foreground">
        Focus a tab and press Alt + Shift + ← or → to move it by keyboard.
      </p>
      <section aria-labelledby="chat-tab-previews" className="space-y-3">
        <div>
          <h2 id="chat-tab-previews" className="text-lg font-semibold">
            Chat tab previews
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Hover a tab to see its latest messages. Select it to open the
            conversation.
          </p>
        </div>
        <MacOSWindow title="Chat examples" className={frameClassName}>
          <WorkspaceTabsDemo key={reset} createDemo={createChatFixture} />
        </MacOSWindow>
      </section>
    </main>
  );
}

function WorkspaceTabsDemo({
  createDemo,
}: {
  createDemo: () => {
    group: EditorGroup;
    panels: WorkbenchPanels;
    browsers?: WorkspaceBrowserTabs;
  };
}) {
  const [{ group, panels, browsers }] = useState(createDemo);
  const { tabs, active } = useSyncExternalStore(
    group.subscribe,
    group.getSnapshot,
    group.getSnapshot
  );
  const shownPanels = useSyncExternalStore(
    panels.subscribe,
    panels.getSnapshot,
    panels.getSnapshot
  );
  const selected = active ? WorkbenchTab.parse(active) : null;
  const content =
    selected?.kind === "panel"
      ? shownPanels.get(selected.id)?.content
      : selected?.kind === "file"
        ? selected.relPath
        : selected?.kind === "browser"
          ? browser.url
          : resetHint;

  return (
    <div className="min-w-0">
      <EditorTitleBar
        workspace={workspace}
        tabs={tabs}
        panels={shownPanels}
        browserEntries={browserEntries}
        browsers={browsers}
        activeTab={active}
        dirtyPaths={dirtyPaths}
        showStart={tabs.length === 0}
        onOpenStart={() => {
          panels.show(
            "quick-start",
            {
              title: "Quick Start",
              content: resetHint,
            },
            () => {}
          );
          panels.reveal("quick-start");
        }}
        onSelect={(tab) => group.activate(tab)}
        onMove={(tab, target) => group.move(tab, target)}
        onClose={(tab) => group.close(tab)}
        onCloseOthers={async (keep) =>
          group.closeMatching((tab) => tab !== keep)
        }
        utilitiesVisible={false}
      />
      <div className="mx-2 mb-2 flex h-56 min-h-0 flex-col overflow-hidden rounded-lg border">
        {typeof content === "string" ? (
          <div className="grid flex-1 place-items-center bg-muted/25 px-4 text-center text-sm text-muted-foreground">
            {content}
          </div>
        ) : (
          content
        )}
      </div>
    </div>
  );
}

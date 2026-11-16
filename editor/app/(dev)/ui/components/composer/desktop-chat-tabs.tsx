"use client";

import { useState } from "react";
import { MessageSquareTextIcon } from "lucide-react";
import type { NativeChatMessage } from "@grida/desktop-bridge";
import { Button } from "@app/ui/components/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@app/ui/components/hover-card";
import { MacOSWindow } from "@/components/frames/macos-desktop";
import { WorkbenchPanelTab } from "@/scaffolds/desktop/workbench/workbench-panel-tab";
import { ChatTabPreviewContent } from "@/scaffolds/desktop/workbench/editor-tab-chat-preview";
import { DesktopConversation } from "./desktop-conversation";
import { DesktopComposerFixtures } from "./desktop-fixtures";

const tabIds = ["current", "waiting", "image", "empty"] as const;
type TabId = (typeof tabIds)[number];
type Example = Readonly<{
  title: string;
  messages: readonly NativeChatMessage[];
}>;
const examples: Record<Exclude<TabId, "current">, Example> = {
  waiting: {
    title: "Waiting for reply",
    messages: [
      {
        messageId: "tab-waiting",
        role: "user",
        text: "Please check the spacing between the model picker and Send. Keep the composer compact in the narrow layout.",
      },
    ],
  },
  image: {
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
  empty: { title: "New chat", messages: [] },
};

/** A small app window using the workbench's tab view and chat preview content. */
export function DesktopChatTabs({
  messages,
}: {
  messages: readonly NativeChatMessage[];
}) {
  const [open, setOpen] = useState<readonly TabId[]>(tabIds);
  const [active, setActive] = useState<TabId | null>("current");
  const [preview, setPreview] = useState<TabId | null>(null);
  const tabs: Record<TabId, Example> = {
    current: { title: "Current chat", messages },
    ...examples,
  };
  const close = (id: TabId) => {
    if (preview === id) setPreview(null);
    const remaining = open.filter((candidate) => candidate !== id);
    setOpen(remaining);
    if (active === id)
      setActive(remaining[Math.max(0, open.indexOf(id) - 1)] ?? null);
  };
  return (
    <section
      data-testid="desktop-chat-tabs-demo"
      className="mx-auto w-full max-w-3xl space-y-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Chat tab previews</h2>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            setOpen(tabIds);
            setActive("current");
            setPreview(null);
          }}
        >
          Reset tabs
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Hover or focus a tab to preview its latest messages. Select a tab to
        open the example; Current chat follows the conversation above.
      </p>
      <MacOSWindow
        title="Grida · Chat previews"
        className="border-border bg-background shadow-sm"
      >
        <div
          role="tablist"
          aria-label="Example chat tabs"
          className="flex h-11 items-center gap-1 overflow-x-auto border-b px-1.5"
        >
          {open.map((id) => (
            <HoverCard
              key={id}
              open={preview === id}
              onOpenChange={(opened) =>
                setPreview((current) =>
                  opened ? id : current === id ? null : current
                )
              }
              openDelay={200}
              closeDelay={100}
            >
              <HoverCardTrigger asChild>
                <WorkbenchPanelTab
                  id={`chat-preview-tab-${id}`}
                  aria-controls={`chat-preview-panel-${id}`}
                  title={tabs[id].title}
                  icon={<MessageSquareTextIcon className="size-3.5 shrink-0" />}
                  active={active === id}
                  onSelect={() => {
                    setActive(id);
                    setPreview(null);
                  }}
                  onClose={() => close(id)}
                />
              </HoverCardTrigger>
              <HoverCardContent
                side="bottom"
                align="start"
                className="w-auto overflow-hidden rounded-xl p-0 pointer-events-none"
              >
                <ChatTabPreviewContent
                  title={tabs[id].title}
                  messages={tabs[id].messages}
                />
              </HoverCardContent>
            </HoverCard>
          ))}
        </div>
        {active ? (
          <div
            role="tabpanel"
            id={`chat-preview-panel-${active}`}
            aria-labelledby={`chat-preview-tab-${active}`}
            className="flex h-64 min-h-0 flex-col"
          >
            <DesktopConversation
              key={active}
              scenario="text"
              messages={tabs[active].messages}
              running={false}
            />
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            No tabs open
          </div>
        )}
      </MacOSWindow>
    </section>
  );
}

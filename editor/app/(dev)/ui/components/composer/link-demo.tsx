"use client";

import { useState } from "react";
import { Button } from "@app/ui/components/button";
import { TooltipProvider } from "@app/ui/components/tooltip";
import { ChatMessageView, type ChatMessage } from "@/kits/agent-chat";
import { ComposerDrafts } from "@/lib/agent-chat/composer-drafts";
import { AgentComposerInput } from "@/scaffolds/desktop/shared/agent-composer-input";

const catalog = { commands: [], mentions: [] };
const links = [
  {
    label: "CSS Grid guide",
    href: "https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout",
  },
  { label: "Grida docs", href: "https://grida.co/docs" },
  { label: "GitHub", href: "https://github.com/gridaco/grida" },
  { label: "Linear", href: "https://linear.app/docs/editor" },
  {
    label: "Figma",
    href: "https://www.figma.com/community/file/1514746685758799870",
  },
  {
    label: "Google Docs",
    href: "https://docs.google.com/document/",
  },
  {
    label: "Google Sheets",
    href: "https://docs.google.com/spreadsheets/",
  },
  { label: "Google Drive", href: "https://drive.google.com/drive/my-drive" },
  { label: "Slack", href: "https://app.slack.com/client/" },
  {
    label: "Notion",
    href: "https://www.notion.com/templates/product-spec-notion",
  },
];
const references = links
  .map(({ label, href }) => `[${label}](${href})`)
  .join(", ");
const messages: ChatMessage[] = [
  {
    id: "links-user",
    role: "user",
    parts: [{ type: "text", text: `Use these references: ${references}.` }],
  },
  {
    id: "links-agent",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: `I’ll use these for the handoff: ${references}.`,
      },
    ],
  },
];

function createDraft() {
  const key = "link-demo";
  const store = new ComposerDrafts(null, null);
  store.write(key, {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Take a look at " },
          ...links.flatMap(({ label, href }, index) => [
            ...(index ? [{ type: "text", text: ", " }] : []),
            {
              type: "text",
              text: label,
              marks: [{ type: "link", attrs: { href } }],
            },
          ]),
          { type: "text", text: "." },
        ],
      },
    ],
  });
  return { key, store };
}

export function LinkDemo() {
  const [example, setExample] = useState(0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Click a draft link to edit it. Send the draft to compare it with the
          links in the transcript.
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setExample((current) => current + 1)}
        >
          Reset
        </Button>
      </div>
      <LinkExample key={example} />
    </div>
  );
}

function LinkExample() {
  const [draft] = useState(createDraft);
  const [transcript, setTranscript] = useState(messages);

  return (
    <TooltipProvider>
      <div className="space-y-6 rounded-xl border bg-background p-4">
        {transcript.map((message) => (
          <ChatMessageView key={message.id} message={message} />
        ))}
        <AgentComposerInput
          catalog={catalog}
          draft={draft}
          isStreaming={false}
          onStop={() => {}}
          onSubmit={(text) =>
            setTranscript((current) => [
              ...current,
              {
                id: `links-sent-${current.length}`,
                role: "user",
                parts: [{ type: "text", text }],
              },
            ])
          }
        />
      </div>
    </TooltipProvider>
  );
}

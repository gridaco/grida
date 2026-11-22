"use client";

import { useState } from "react";
import { Button } from "@app/ui/components/button";
import { TooltipProvider } from "@app/ui/components/tooltip";
import { ChatMessageView, type ChatMessage } from "@/kits/agent-chat";
import { ComposerDrafts } from "@/lib/agent-chat/composer-drafts";
import { BrowserPreview } from "@/lib/desktop/browser-open-context";
import { PagePreviews } from "@/lib/desktop/page-previews";
import { AgentComposerInput } from "@/scaffolds/desktop/shared/agent-composer-input";
import type { WebPreview } from "@grida/desktop-bridge";

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
const linkPreviews = new Map<string, WebPreview.Metadata>([
  [
    links[0].href,
    {
      title: "CSS Grid layout",
      description: "Learn to arrange content in rows and columns with CSS.",
    },
  ],
  [
    "https://grida.co/docs",
    {
      title: "Grida documentation",
      description: "Guides and references for Grida’s design tools.",
      // The demo uses local artwork so both slots work without Electron.
      favicon: { dataUrl: "/logos/grida-favicon.png" },
      image: { dataUrl: "/www/2026-10/wind-garden-repaint/preview.webp" },
    },
  ],
  [
    "https://github.com/gridaco/grida",
    {
      title: "gridaco/grida",
      description: "Grida’s open-source design tools.",
    },
  ],
]);

function loadLinkPreview(
  href: string,
  signal: AbortSignal
): Promise<WebPreview.Metadata | null> {
  if (signal.aborted) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve(linkPreviews.get(href) ?? null);
    }, 850);
    const cancel = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    signal.addEventListener("abort", cancel, { once: true });
  });
}
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
          links in the transcript. Hover Grida docs for the image preview, CSS
          Grid guide for a text preview, or Linear for the fallback.
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
  const [previews] = useState(
    () =>
      new PagePreviews.Controller(async (href, signal) => ({
        metadata: await loadLinkPreview(href, signal),
      }))
  );

  return (
    <TooltipProvider>
      <div className="space-y-6 rounded-xl border bg-background p-4">
        <BrowserPreview value={previews}>
          {transcript.map((message) => (
            <ChatMessageView key={message.id} message={message} />
          ))}
        </BrowserPreview>
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

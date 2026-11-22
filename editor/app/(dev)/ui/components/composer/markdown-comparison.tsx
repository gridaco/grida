"use client";

import { useState } from "react";
import { Button } from "@app/ui/components/button";
import { ChatMessageView, type ChatMessage } from "@/kits/agent-chat";
import { ComposerDrafts } from "@/lib/agent-chat/composer-drafts";
import { AgentComposerInput } from "@/scaffolds/desktop/shared/agent-composer-input";

const catalog = { commands: [], mentions: [] };
const link = "https://grida.co/docs";
const code = 'const label = "Gallery";';
const sample = [
  `**Gallery** uses *sentence case*. See the [guide](${link}) for \`label\`.`,
  "Keep labels short.",
  "- Gallery entrance\n  - Accessible ramp",
  "1. Review the draft.\n2. Publish the guide.",
  "> Check the sign at actual size.",
  ["```javascript", code, "```"].join("\n"),
].join("\n\n");

const extendedSample = [
  "# Gallery handout",
  [
    "| Stop | Location | Minutes |",
    "| :--- | :------: | ------: |",
    "| Entrance | Ground floor | 5 |",
    "| Print gallery | Level 1 | 20 |",
  ].join("\n"),
  "## Visitor information",
  "### Opening hours",
  "#### Weekdays",
  "##### Morning",
  "###### Exceptions",
  "Doors open at ~~9:00~~ **10:00**.  \nLast entry is at 16:30.",
  "https://grida.co/docs",
  "---",
  "- [x] Review opening hours\n- [ ] Confirm the accessible route",
  [
    "```ts",
    'const route = { start: "Gallery entrance", next: "Print gallery", accessible: true };',
    "console.log(route);",
    "```",
  ].join("\n"),
  "![Wind Garden artwork](/www/2026-10/wind-garden-repaint/preview.webp)",
  "Opening hours may vary on holidays.[^hours]",
  "[^hours]: Confirm the schedule before printing.",
  "The area $A$ of the sign is:",
  "$$\nA = w \\times h\n$$",
  ["```mermaid", "flowchart LR", "  Entrance --> Gallery --> Exit", "```"].join(
    "\n"
  ),
].join("\n\n");

function createDraft() {
  const key = "markdown-comparison";
  const store = new ComposerDrafts(null, null);
  store.write(key, {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Gallery", marks: [{ type: "bold" }] },
          { type: "text", text: " uses " },
          { type: "text", text: "sentence case", marks: [{ type: "italic" }] },
          { type: "text", text: ". See the " },
          {
            type: "text",
            text: "guide",
            marks: [{ type: "link", attrs: { href: link } }],
          },
          { type: "text", text: " for " },
          { type: "text", text: "label", marks: [{ type: "code" }] },
          { type: "text", text: "." },
        ],
      },
      paragraph("Keep labels short."),
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              paragraph("Gallery entrance"),
              { type: "bulletList", content: [listItem("Accessible ramp")] },
            ],
          },
        ],
      },
      {
        type: "orderedList",
        content: [
          listItem("Review the draft."),
          listItem("Publish the guide."),
        ],
      },
      {
        type: "blockquote",
        content: [paragraph("Check the sign at actual size.")],
      },
      {
        type: "codeBlock",
        attrs: { language: "javascript" },
        content: [{ type: "text", text: code }],
      },
    ],
  });
  return { key, store };
}

function paragraph(text: string) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function listItem(text: string) {
  return { type: "listItem", content: [paragraph(text)] };
}

export function MarkdownComparison() {
  const [revision, setRevision] = useState(0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Edit and send the draft to compare the same content in both message
          roles.
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setRevision((current) => current + 1)}
        >
          Reset
        </Button>
      </div>
      <Comparison key={revision} />
      <div className="min-w-0 space-y-4 rounded-xl border bg-background p-4">
        <h3 className="text-sm font-medium">Extended Markdown</h3>
        <TranscriptComparison text={extendedSample} labelLevel="h4" />
      </div>
    </div>
  );
}

function Comparison() {
  const [draft] = useState(createDraft);
  const [text, setText] = useState(sample);

  return (
    <div className="min-w-0 space-y-4 rounded-xl border bg-background p-4">
      <h3 className="text-xs font-medium text-muted-foreground">Composer</h3>
      <AgentComposerInput
        catalog={catalog}
        draft={draft}
        autofocus={false}
        isStreaming={false}
        onStop={() => {}}
        onSubmit={setText}
      />
      <TranscriptComparison text={text} labelLevel="h3" />
    </div>
  );
}

function TranscriptComparison({
  text,
  labelLevel: Label,
}: {
  text: string;
  labelLevel: "h3" | "h4";
}) {
  return (["user", "assistant"] as const).map((role) => {
    const message: ChatMessage = {
      id: role,
      role,
      parts: [{ type: "text", text }],
    };
    return (
      <div key={role} className="min-w-0 space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">
          {role === "user" ? "Sent message" : "Agent response"}
        </Label>
        <ChatMessageView message={message} />
      </div>
    );
  });
}

"use client";

import { useRef, useState } from "react";
import { Button } from "@app/ui/components/button";
import { ChatResponseCards, workspace_links } from "@/kits/agent-chat";
import { ResponseCards } from "@/lib/agent-chat/response-cards";
import { BrowserPreview } from "@/lib/desktop/browser-open-context";
import { PagePreviews } from "@/lib/desktop/page-previews";

const url = "http://127.0.0.1:4174/plan";
const cards = ResponseCards.forReply({ text: url });
const viewer = {
  title: "Gallery cover workflow",
  productLabel: "FX Viewer",
  favicon: { dataUrl: "/logos/grida-favicon.png" },
};
const open = () => true;

export function PreviewRefreshDemo() {
  const running = useRef(false);
  const [online, setOnline] = useState(false);
  const [checks, setChecks] = useState(0);
  const [previews] = useState(
    () =>
      new PagePreviews.Controller(async () => {
        setChecks((count) => count + 1);
        return { metadata: running.current ? viewer : null };
      })
  );

  return (
    <BrowserPreview value={previews}>
      <div className="space-y-3 rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              running.current = !running.current;
              setOnline(running.current);
            }}
          >
            {online ? "Stop sample server" : "Start sample server"}
          </Button>
          <span role="status" className="text-xs text-muted-foreground">
            Preview checks: {checks}
          </span>
        </div>
        <p className="text-sm">
          Hover{" "}
          <workspace_links.Link href={`${url}#details`}>
            workflow viewer
          </workspace_links.Link>{" "}
          to refresh both cards.
        </p>
        <ChatResponseCards cards={cards} open={open} />
        <ChatResponseCards cards={cards} open={open} />
      </div>
    </BrowserPreview>
  );
}

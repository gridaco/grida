"use client";

/**
 * `/ui/components/ai-chat/markdown` — compares bare Streamdown defaults with
 * the opt-in compact class used by AI/Agent assistant responses.
 */

import { useState } from "react";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { Button } from "@/components/ui/button";
import { Response } from "@/components/ai-elements/response";
import { MARKDOWN_SAMPLE } from "./_sample";

const VARIANTS = [
  { id: "default", label: "Default" },
  { id: "ai-compact", label: "AI compact" },
] as const;

type VariantId = (typeof VARIANTS)[number]["id"];

const markdown = {
  className: "grida-ai-response-markdown space-y-2 text-sm leading-6",
  controls: {
    code: { copy: true, download: false },
    table: { copy: true, download: false, fullscreen: false },
  },
  plugins: { cjk, code, math, mermaid },
} as const;

export default function MarkdownDemoPage() {
  const [source, setSource] = useState(MARKDOWN_SAMPLE);
  const [variant, setVariant] = useState<VariantId>("default");

  const responseClassName =
    variant === "ai-compact" ? markdown.className : undefined;
  const responseControls =
    variant === "ai-compact" ? markdown.controls : undefined;

  return (
    <main className="container mx-auto max-w-screen-xl py-10">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">AI Response Markdown</h1>
          <p className="max-w-2xl text-muted-foreground text-sm">
            Compare bare <code>Streamdown</code> defaults against the opt-in
            compact class used for AI/Agent assistant responses.
          </p>
        </div>

        <hr />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">Variant:</span>
          {VARIANTS.map((v) => (
            <Button
              key={v.id}
              size="sm"
              variant={v.id === variant ? "default" : "outline"}
              onClick={() => setVariant(v.id)}
            >
              {v.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
            className="h-[640px] min-h-[320px] flex-1 resize-y rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />

          <div className="flex w-full min-w-0 justify-center lg:flex-1 lg:justify-start">
            <div className="w-96 rounded-lg border bg-background">
              <div className="border-b px-3 py-1.5 text-muted-foreground text-xs">
                Preview · {VARIANTS.find((v) => v.id === variant)?.label}
              </div>
              <div className="max-h-[640px] overflow-auto p-3">
                <Response
                  key={variant}
                  className={responseClassName}
                  controls={responseControls}
                  plugins={markdown.plugins}
                >
                  {source}
                </Response>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

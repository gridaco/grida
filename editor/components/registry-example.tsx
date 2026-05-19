"use client";

import {
  CodeBlock,
  CodeBlockCopyButton,
} from "@/components/ai-elements/code-block";
import { cn } from "@/components/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { registry } from "@/registry/__index__";
import * as React from "react";
import type { BundledLanguage } from "shiki";

// ───────────────────────────────────────────────────────────────────────────
// RegistryExample — preview / code tab pair backed by the generated
// registry (`editor/registry/__index__.ts`). Mirrors shadcn-ui's
// <ComponentPreview>: one `name` prop, the same `.tsx` file feeds the
// live render. The code tab defaults to the file source but can be
// overridden with a compact, hand-tailored snippet (the source is what
// you'd ship via `npx shadcn add`; the snippet is what looks good in
// docs).
// ───────────────────────────────────────────────────────────────────────────

export interface RegistryExampleProps {
  /** Registry key, e.g. "examples/tree-view/quick-start". */
  name: string;
  /** Shiki language for the code tab. Defaults to `tsx`. */
  language?: BundledLanguage;
  /** Optional title shown above the tabs. */
  title?: string;
  /** Wrapper class for the outer card. */
  className?: string;
  /** Class for the preview pane (controls aspect ratio, padding, etc.). */
  previewClassName?: string;
  /**
   * Override the code-tab content with a hand-tailored snippet. When
   * omitted, the literal `.tsx` source from the registry is shown.
   */
  code?: string;
  /** Which tab is active on first render. Defaults to `"code"`. */
  defaultTab?: "preview" | "code";
}

export function RegistryExample({
  name,
  language = "tsx",
  title,
  className,
  previewClassName,
  code,
  defaultTab = "code",
}: RegistryExampleProps) {
  const entry = registry[name];
  if (!entry) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
        Registry entry not found: <code className="font-mono">{name}</code>
      </div>
    );
  }
  const Component = entry.component;
  const codeSource = code ?? entry.source;
  // `min-w-0` cascades down from the grid item to the inner Shiki pane so
  // long code lines scroll instead of forcing the surrounding column to
  // its `max-content` width. Without this, switching from the (narrow)
  // preview tab to the (wide-content) code tab visibly resizes the
  // column.
  return (
    <div className={cn("min-w-0 space-y-3", className)}>
      {title ? (
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      ) : null}
      <Tabs defaultValue={defaultTab} className="min-w-0 gap-3">
        <TabsList variant="line" className="h-8">
          <TabsTrigger value="code" className="text-xs">
            Code
          </TabsTrigger>
          <TabsTrigger value="preview" className="text-xs">
            Preview
          </TabsTrigger>
        </TabsList>
        {/* Both panes share the same outer height (`h-[360px]` on the
            outermost rounded card of each) so switching tabs doesn't
            shift the page. The inner Shiki pre and the demo container
            each `overflow-auto` inside that fixed box. */}
        <TabsContent value="code" className="mt-0 min-w-0">
          <CodeBlock
            code={codeSource}
            language={language}
            className="h-[360px] min-w-0 [&_code]:!text-xs [&_pre]:!text-xs [&_pre]:h-full [&_pre]:overflow-auto [&_pre]:overscroll-contain"
          >
            <CodeBlockCopyButton />
          </CodeBlock>
        </TabsContent>
        <TabsContent value="preview" className="mt-0 min-w-0">
          <div
            className={cn(
              "h-[360px] overflow-auto rounded-2xl border border-zinc-200 bg-white p-4",
              previewClassName
            )}
          >
            <React.Suspense
              fallback={
                <div className="text-xs text-muted-foreground">Loading…</div>
              }
            >
              <Component />
            </React.Suspense>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { markdown as markdownLang } from "@codemirror/lang-markdown";
import type { Extension } from "@codemirror/state";
import { Button } from "@app/ui/components/button";
import { cn } from "@app/ui/lib/utils";
import {
  CodeMirrorEditor,
  type CodeMirrorHandle,
} from "@/components/codemirror";
import {
  codeLanguages,
  resolveLanguage,
} from "@/components/codemirror/languages";

/**
 * Demo for the owned CodeMirror 6 mount (`@/components/codemirror`) — the
 * generic editable text/code surface (sibling of `@/components/monaco`).
 * Exercises the public API: the `CodeMirrorHandle` (getValue/setValue), the
 * `language` compartment (lazy grammar load per filename), the `readOnly`
 * compartment, `onDocChange`, and theme-follows-app via next-themes.
 */

type Preset = { label: string; filename: string; doc: string };

const PRESETS: Preset[] = [
  {
    label: "Markdown",
    filename: "README.md",
    doc: `# CodeMirror mount

A *thin, owned* binding over **CodeMirror 6** — no third-party wrapper.

- language resolved lazily from the filename
- theme follows the app (light / One Dark)
- \`readOnly\` and language swap via compartments — no remount

\`\`\`ts
const view = new EditorView({ state, parent });
\`\`\`
`,
  },
  {
    label: "TypeScript",
    filename: "example.ts",
    doc: `import { EditorView } from "@codemirror/view";

export function mount(parent: HTMLElement, doc: string) {
  return new EditorView({ doc, parent });
}
`,
  },
  {
    label: "JSON",
    filename: "data.json",
    doc: `{
  "name": "@grida/codemirror",
  "private": true,
  "languages": ["markdown", "typescript", "json", "python"]
}
`,
  },
  {
    label: "Python",
    filename: "main.py",
    doc: `def fib(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
`,
  },
  {
    label: "Plain text",
    filename: "notes.txt",
    doc: "No grammar matches .txt, so the editor runs with no language —\nstill fully editable, just unhighlighted.\n",
  },
];

// Built once for the page's lifetime — same construction the workbench
// markdown editor uses (fenced-code-block highlighting via the lazy set).
const MARKDOWN_LANGUAGE = markdownLang({ codeLanguages });

function languageFor(preset: Preset): Promise<Extension | undefined> {
  if (preset.filename.endsWith(".md"))
    return Promise.resolve(MARKDOWN_LANGUAGE);
  return resolveLanguage(preset.filename);
}

export default function CodeMirrorDemoPage() {
  const handleRef = useRef<CodeMirrorHandle>(null);
  const { resolvedTheme } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const [language, setLanguage] = useState<Extension | undefined>(undefined);
  const [readOnly, setReadOnly] = useState(false);
  const [output, setOutput] = useState(PRESETS[0].doc);

  // Resolve the active preset's language — covers mount and every switch.
  useEffect(() => {
    let cancelled = false;
    void languageFor(PRESETS[activeIndex]).then((ext) => {
      if (!cancelled) setLanguage(ext);
    });
    return () => {
      cancelled = true;
    };
  }, [activeIndex]);

  const selectPreset = useCallback((index: number) => {
    const preset = PRESETS[index];
    setActiveIndex(index);
    // Imperative reseed — the view owns the doc, so swapping samples goes
    // through the handle, not a controlled `value` prop. The language follows
    // `activeIndex` via the effect above.
    handleRef.current?.setValue(preset.doc);
    setOutput(preset.doc);
  }, []);

  const onDocChange = useCallback(() => {
    setOutput(handleRef.current?.getValue() ?? "");
  }, []);

  return (
    <main className="container mx-auto max-w-screen-lg py-10">
      <div className="space-y-8">
        <div>
          <h1 className="mb-2 text-3xl font-bold">Code Editor (CodeMirror)</h1>
          <p className="text-muted-foreground">
            The owned CodeMirror 6 mount at{" "}
            <code className="text-xs">@/components/codemirror</code> — the
            generic editable text/code surface, sibling of{" "}
            <code className="text-xs">@/components/monaco</code>. It backs the
            workbench markdown editor and is the editable fallback for any text
            format.
          </p>
        </div>

        <hr />

        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 text-sm font-medium">Language</span>
            {PRESETS.map((preset, i) => (
              <Button
                key={preset.filename}
                size="sm"
                variant={i === activeIndex ? "default" : "outline"}
                onClick={() => selectPreset(i)}
              >
                {preset.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant={readOnly ? "default" : "outline"}
              onClick={() => setReadOnly((v) => !v)}
              className="ml-auto"
            >
              {readOnly ? "Read-only: on" : "Read-only: off"}
            </Button>
          </div>

          <div
            className={cn(
              "h-[440px] overflow-hidden rounded-lg border bg-background"
            )}
          >
            <CodeMirrorEditor
              ref={handleRef}
              initialValue={PRESETS[0].doc}
              language={language}
              readOnly={readOnly}
              dark={resolvedTheme === "dark"}
              onDocChange={onDocChange}
              autoFocus
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Editing is live — try typing, multi-cursor (
            <kbd className="text-[10px]">Alt</kbd>+click), search (
            <kbd className="text-[10px]">Cmd/Ctrl+F</kbd>), and toggle the app
            theme to see the editor follow it.
          </p>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="mb-1 text-xl font-semibold">Serialized output</h2>
            <p className="text-sm text-muted-foreground">
              <code className="text-xs">handle.getValue()</code>, updated on
              every <code className="text-xs">onDocChange</code> — identity
              serialization, so this is exactly what a save would write.
            </p>
          </div>
          <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs">
            {output || "(empty)"}
          </pre>
        </section>
      </div>
    </main>
  );
}

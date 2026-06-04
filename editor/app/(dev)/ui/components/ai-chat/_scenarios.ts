/**
 * Scenario scripts for the AI Chat renderer demo. Each scenario is a
 * `UIMessageChunk[]` the mock transport replays; the Stream/Instant controls
 * decide whether you watch it build or jump to the settled state, so scenarios
 * encode *content shapes* only (not streaming-vs-settled — that's a control axis).
 */

import type { UIMessage, UIMessageChunk } from "ai";
import {
  assistantMsg,
  compactionMsg,
  reasoning,
  streamError,
  text,
  toolCall,
  userMsg,
} from "./_mock-transport";

export type Scenario = {
  id: string;
  label: string;
  group: string;
  /** Settled history seeded into the Chat before the streamed turn. */
  initial_messages?: UIMessage[];
  chunks: UIMessageChunk[];
  /**
   * Render the in-flight compaction shimmer (RFC `session / compaction`) at
   * the transcript tail. A static state — like the tool-call states in the
   * "States" group — so the shimmer animates continuously and is tunable.
   * The settled summary is a separate scenario carrying a `data-compaction`
   * message in `initialMessages`.
   */
  compacting?: boolean;
};

const MARKDOWN = `## Plan

I'll make three changes:

1. Tighten the \`viewBox\`
2. Add a **drop shadow**
3. Normalize the palette

\`\`\`tsx
function Logo() {
  return <svg viewBox="0 0 24 24" aria-label="Grida" />;
}
\`\`\`

Inline \`code\`, _emphasis_, and [links](https://grida.co) all render.`;

const LONG_CONTENT = Array.from(
  { length: 40 },
  (_, i) =>
    `  <rect x="${i}" y="${i}" width="10" height="10" fill="#${i}${i}f" />`
).join("\n");

export const SCENARIOS: Scenario[] = [
  // --- D. Composition (default) ---
  {
    id: "text-tools-text",
    label: "Text → tools → text",
    group: "Composition",
    chunks: [
      ...text("t1", "Sure — I'll read the logo, then tighten its viewBox."),
      ...toolCall({
        toolCallId: "c1",
        toolName: "read_file",
        input: { path: "/src/logo.svg" },
        output: { ok: true, content: "<svg viewBox='0 0 48 48' />" },
      }),
      ...toolCall({
        toolCallId: "c2",
        toolName: "edit_file",
        input: { path: "/src/logo.svg" },
        output: { ok: true, occurrences: 1 },
      }),
      ...text("t2", "Done — the viewBox is now `0 0 24 24` and centered."),
    ],
  },
  {
    id: "multi-turn",
    label: "Multi-turn history",
    group: "Composition",
    initial_messages: [
      userMsg("Make the logo bigger."),
      assistantMsg("Increased the artboard scale by 1.5×."),
    ],
    chunks: [
      ...text("t1", "And here's a tighter crop on the glyph."),
      ...toolCall({
        toolCallId: "c1",
        toolName: "edit_file",
        input: { path: "/src/logo.svg" },
        output: { ok: true, occurrences: 2 },
      }),
    ],
  },

  // --- G. Lifecycle (compaction) ---
  {
    id: "lifecycle-compacting",
    label: "Compacting (in progress)",
    group: "Lifecycle",
    compacting: true,
    initial_messages: [
      userMsg(
        "Refactor the logo into its own component and tighten the viewBox."
      ),
      assistantMsg(
        'Done — extracted `<Logo>` into `src/logo.tsx`, set `viewBox="0 0 24 24"`, and normalized the palette.'
      ),
    ],
    chunks: [],
  },
  {
    id: "lifecycle-compacted",
    label: "Compacted (summary)",
    group: "Lifecycle",
    // The full history stays visible and linear; the "compacted" divider sits
    // at the BOTTOM, where the user fired /compact. The model resumes from the
    // summary; the transcript keeps everything above the line.
    initial_messages: [
      userMsg(
        "Refactor the logo into its own component and tighten the viewBox."
      ),
      assistantMsg(
        'Done — extracted `<Logo>` into `src/logo.tsx`, set `viewBox="0 0 24 24"`.'
      ),
      userMsg("Normalize the palette to three tokens."),
      assistantMsg(
        "Palette normalized — teal, coral, and ink, all in `tokens.css`."
      ),
      userMsg("Wire it into the header and drop the inline SVG."),
      assistantMsg("Header now imports `<Logo>`; the inline SVG is gone."),
      compactionMsg(
        [
          "## Goal",
          "Refactor the logo into a reusable component and tighten its viewBox.",
          "",
          "## Progress",
          'Extracted `<Logo>` into `src/logo.tsx`; set `viewBox="0 0 24 24"`; normalized the palette to three tokens in `tokens.css`.',
          "",
          "## Decisions",
          "Keep the artboard square; palette tokens live in `tokens.css`.",
          "",
          "## Next steps",
          "Wire `<Logo>` into the header and delete the inline SVG.",
        ].join("\n"),
        { auto: false }
      ),
    ],
    chunks: [],
  },

  // --- A. Actions (one settled call each) ---
  {
    id: "action-read",
    label: "Read",
    group: "Actions",
    chunks: toolCall({
      toolCallId: "c1",
      toolName: "read_file",
      input: { path: "/src/app.tsx" },
      output: { ok: true, content: "export default function App() {}" },
    }),
  },
  {
    id: "action-edit",
    label: "Edit (3 occurrences)",
    group: "Actions",
    chunks: toolCall({
      toolCallId: "c1",
      toolName: "edit_file",
      input: { path: "/src/app.tsx" },
      output: { ok: true, occurrences: 3 },
    }),
  },
  {
    id: "action-write",
    label: "Write",
    group: "Actions",
    chunks: toolCall({
      toolCallId: "c1",
      toolName: "write_file",
      input: { path: "/src/new.tsx", content: "// new file" },
      output: { ok: true },
    }),
  },
  {
    id: "action-list",
    label: "List files",
    group: "Actions",
    chunks: toolCall({
      toolCallId: "c1",
      toolName: "list_files",
      input: { path: "/src" },
      output: {
        ok: true,
        files: Array.from({ length: 12 }, (_, i) => `/src/file-${i}.tsx`),
      },
    }),
  },
  {
    id: "action-search",
    label: "Search (grep)",
    group: "Actions",
    chunks: toolCall({
      toolCallId: "c1",
      toolName: "grep_files",
      input: { pattern: "useChat" },
      output: { ok: true, matches: ["chat.tsx:126", "workspace-chat.tsx:169"] },
    }),
  },
  {
    id: "action-plan",
    label: "Plan (todos)",
    group: "Actions",
    chunks: toolCall({
      toolCallId: "c1",
      toolName: "todo_write",
      input: { todos: [1, 2, 3, 4, 5].map((n) => ({ title: `Step ${n}` })) },
      output: { ok: true, count: 5 },
    }),
  },
  {
    id: "action-command",
    label: "Command",
    group: "Actions",
    chunks: toolCall({
      toolCallId: "c1",
      toolName: "run_command",
      input: {
        command: "pnpm",
        args: ["typecheck"],
        description: "Typecheck editor",
      },
      output: { ok: true, exit_code: 0 },
    }),
  },
  {
    id: "action-generic",
    label: "Generic / dynamic tool",
    group: "Actions",
    chunks: toolCall({
      toolCallId: "c1",
      toolName: "search_web",
      input: { query: "svg viewBox best practices" },
      output: { ok: true, results: 3 },
    }),
  },

  // --- B. States (read_file carrier) ---
  {
    id: "state-input-streaming",
    label: "Input streaming",
    group: "States",
    chunks: toolCall({
      toolCallId: "c1",
      toolName: "read_file",
      state: "input-streaming",
    }),
  },
  {
    id: "state-input-available",
    label: "Input available (running)",
    group: "States",
    chunks: toolCall({
      toolCallId: "c1",
      toolName: "read_file",
      input: { path: "/src/app.tsx" },
      state: "input-available",
    }),
  },
  {
    id: "state-output-error",
    label: "Output error",
    group: "States",
    chunks: toolCall({
      toolCallId: "c1",
      toolName: "read_file",
      input: { path: "/src/missing.tsx" },
      errorText: "ENOENT: no such file or directory",
    }),
  },
  {
    id: "state-output-denied",
    label: "Output denied",
    group: "States",
    chunks: toolCall({
      toolCallId: "c1",
      toolName: "read_file",
      input: { path: "/etc/secrets" },
      denied: true,
    }),
  },
  {
    id: "state-warn",
    label: "Soft failure (ok: false)",
    group: "States",
    chunks: toolCall({
      toolCallId: "c1",
      toolName: "edit_file",
      input: { path: "/src/app.tsx" },
      output: { ok: false, error: "no matching snippet" },
    }),
  },

  // --- C. Grouping ---
  {
    id: "group-reads",
    label: "Grouped: 3 reads",
    group: "Grouping",
    chunks: [
      ...toolCall({
        toolCallId: "c1",
        toolName: "read_file",
        input: { path: "/src/a.tsx" },
        output: { ok: true },
      }),
      ...toolCall({
        toolCallId: "c2",
        toolName: "read_file",
        input: { path: "/src/b.tsx" },
        output: { ok: true },
      }),
      ...toolCall({
        toolCallId: "c3",
        toolName: "read_file",
        input: { path: "/src/c.tsx" },
        output: { ok: true },
      }),
    ],
  },
  {
    id: "group-mixed",
    label: "Grouped: mixed actions",
    group: "Grouping",
    chunks: [
      ...toolCall({
        toolCallId: "c1",
        toolName: "edit_file",
        input: { path: "/src/a.tsx" },
        output: { ok: true, occurrences: 1 },
      }),
      ...toolCall({
        toolCallId: "c2",
        toolName: "read_file",
        input: { path: "/src/b.tsx" },
        output: { ok: true },
      }),
      ...toolCall({
        toolCallId: "c3",
        toolName: "run_command",
        input: { command: "pnpm", args: ["test"], description: "Run tests" },
        output: { ok: true, exit_code: 0 },
      }),
    ],
  },

  // --- E. Reasoning ---
  {
    id: "reasoning-tools",
    label: "Reasoning → text → tool",
    group: "Reasoning",
    chunks: [
      ...reasoning(
        "r1",
        "The user wants a tighter logo. I should read the current SVG first, then adjust the viewBox rather than the width/height so it scales cleanly."
      ),
      ...text("t1", "Reading the logo, then tightening its viewBox."),
      ...toolCall({
        toolCallId: "c1",
        toolName: "edit_file",
        input: { path: "/src/logo.svg" },
        output: { ok: true, occurrences: 1 },
      }),
    ],
  },
  {
    id: "reasoning-then-error",
    label: "Reasoning → stream error",
    group: "Reasoning",
    chunks: [
      ...reasoning(
        "r1",
        "Let me think about the safest refactor here. The file is large, so I'll..."
      ),
      ...streamError("Agent sidecar dropped the stream"),
    ],
  },

  // --- F. Markdown & overflow ---
  {
    id: "markdown-rich",
    label: "Markdown-rich text",
    group: "Markdown",
    chunks: text("t1", MARKDOWN),
  },
  {
    id: "overflow-json",
    label: "Long / overflowing JSON",
    group: "Markdown",
    chunks: toolCall({
      toolCallId: "c1",
      toolName: "read_file",
      input: {
        path: "/src/very/deeply/nested/path/to/a/component/logo-artboard.tsx",
        options: {
          encoding: "utf-8",
          limit: 5000,
          nested: { a: { b: { c: [1, 2, 3] } } },
        },
      },
      output: { ok: true, content: LONG_CONTENT },
    }),
  },

  // --- H. Edge: error ---
  {
    id: "stream-error",
    label: "Stream error (banner)",
    group: "Edge",
    chunks: [
      ...text("t1", "Working on it — reading the file now"),
      ...streamError("Agent sidecar dropped the stream"),
    ],
  },
];

export const DEFAULT_SCENARIO_ID = "text-tools-text";

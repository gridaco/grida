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
  /**
   * Render the pre-first-token "Thinking" indicator at the transcript tail —
   * the dead-air window between a send and the first streamed chunk. A static
   * state (like {@link compacting}) so the shimmer + elapsed timer animate
   * continuously and are tunable, without timing a live stream.
   */
  pending?: boolean;
};

export type ToolCardDemo = {
  id: string;
  label: string;
  message: UIMessage;
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

// A pasted-spec wall of text — overflows the user bubble's collapse threshold
// so the "Show more" affordance (clamp + fade-to-bubble gradient) appears.
const LONG_USER_MESSAGE = [
  "Here's the full spec for the logo refactor — please read all of it before you start.",
  "",
  "1. Extract the inline SVG in `src/header.tsx` into its own `<Logo>` component under `src/logo.tsx`. It should take an optional `size` prop (default 24) and forward `className` so callers can recolor it.",
  "2. Tighten the artboard: the current `viewBox` is `0 0 48 48` with a lot of dead margin. Crop it to `0 0 24 24` and re-center the glyph.",
  "3. Normalize the palette down to three tokens — `teal`, `coral`, and `ink` — and move them into `tokens.css`. Every hard-coded hex in the markup should reference a token instead.",
  "4. Add a subtle drop shadow, but only on the light theme; the dark theme should stay flat.",
  "5. Wire the new `<Logo>` into the header and the footer, and delete the two inline copies.",
  "",
  "Once that's done, run the typecheck and the snapshot tests, and show me the before/after of the header. Thanks!",
].join("\n");

const SAMPLE_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAYAAADlNHIOAAAA30lEQVR42u3boRGEMBBAUcpAIKMogDKgI8y1hkVSTxiYOXEOddlhn1iTuH0i80W6+llry5n3renUY2k6HQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPBigDJO9/RD+Znv+b/vUwJEWX5KgEjLTw/QevnXWVqACMtPCxBl+SkBIi0/PUCEB1kH6AAdoAN0gA7QATpAB+gAHaADdIAO0AE6QAfoAB2gA3SADtABOkAH6AAdoAN0gA7QATpAB+gAHaADfNDwQQMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4OifR0mYQP5m5ZwAAAABJRU5ErkJggg==";

const GENERATE_IMAGE_PROMPT =
  "Create a polished editorial hero image for a design-tool release announcement: a luminous square app mark floating above a precise canvas grid, subtle glass reflections, crisp vector-like edges, quiet studio lighting, premium software aesthetic, mostly neutral background with restrained coral and teal accents, 16:9 composition, no text, no UI chrome.";

const GENERATE_IMAGE_REFERENCES = [
  `data:image/png;base64,${SAMPLE_IMAGE_BASE64}`,
  "/assets/references/editorial-grid-mood.png",
];

const RICH_EDIT_OLD = `import { cn } from "@/lib/utils";

type HeaderProps = {
  title: string;
  subtitle?: string;
};

export function Header({ title, subtitle }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b px-6 py-4">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle ? (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <button className={cn("rounded-md border px-3 py-1.5 text-sm")}>
        Export
      </button>
    </header>
  );
}
`;

const RICH_EDIT_NEW = `import { DownloadIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type HeaderProps = {
  title: string;
  subtitle?: string;
  onExport?: () => void;
};

export function Header({ title, subtitle, onExport }: HeaderProps) {
  return (
    <header className="grid gap-3 border-b px-6 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold tracking-tight">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      <button
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm",
          "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
        onClick={onExport}
        type="button"
      >
        <DownloadIcon className="size-3.5" />
        Export
      </button>
    </header>
  );
}
`;

const RICH_WRITE_CONTENT = `import { SparklesIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type LogoCardProps = {
  title: string;
  description: string;
  tone?: "neutral" | "accent";
  actions?: Array<{
    label: string;
    onClick: () => void;
  }>;
};

const toneClassName = {
  neutral: "border-border bg-background",
  accent: "border-primary/30 bg-primary/5",
} as const;

export function LogoCard({
  title,
  description,
  tone = "neutral",
  actions = [],
}: LogoCardProps) {
  return (
    <section
      className={cn(
        "grid gap-4 rounded-lg border p-4",
        "sm:grid-cols-[auto_1fr] sm:items-start",
        toneClassName[tone]
      )}
    >
      <div className="flex size-9 items-center justify-center rounded-md bg-muted">
        <SparklesIcon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 space-y-3">
        <div className="space-y-1">
          <h3 className="truncate text-sm font-medium">{title}</h3>
          <p className="line-clamp-3 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        {actions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className="h-7 rounded-md border px-2.5 text-xs hover:bg-muted"
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
`;

function toolMessage({
  id,
  toolName,
  input,
  output,
  errorText,
  state = "output-available",
}: {
  id: string;
  toolName: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  state?:
    | "input-streaming"
    | "input-available"
    | "approval-requested"
    | "approval-responded"
    | "output-available"
    | "output-error"
    | "output-denied";
}): UIMessage {
  return {
    id: `tool-demo-${id}`,
    role: "assistant",
    parts: [
      {
        type: `tool-${toolName}`,
        toolCallId: `tool-demo-${id}-call`,
        state,
        input,
        output,
        errorText,
      },
    ],
  } as UIMessage;
}

export const TOOL_CARD_DEMOS: ToolCardDemo[] = [
  {
    id: "read-file",
    label: "read_file",
    message: toolMessage({
      id: "read-file",
      toolName: "read_file",
      input: { path: "/src/app.tsx" },
      output: {
        content: "export default function App() {\n  return <main />;\n}\n",
        version: 7,
      },
    }),
  },
  {
    id: "edit-file",
    label: "edit_file",
    message: toolMessage({
      id: "edit-file",
      toolName: "edit_file",
      input: {
        path: "/src/components/header.tsx",
        old_string: RICH_EDIT_OLD,
        new_string: RICH_EDIT_NEW,
        version: 7,
      },
      output: { ok: true, version: 8, occurrences: 1 },
    }),
  },
  {
    id: "write-file",
    label: "write_file",
    message: toolMessage({
      id: "write-file",
      toolName: "write_file",
      input: {
        path: "/src/components/logo-card.tsx",
        content: RICH_WRITE_CONTENT,
      },
      output: { ok: true, version: 1 },
    }),
  },
  {
    id: "list-files",
    label: "list_files",
    message: toolMessage({
      id: "list-files",
      toolName: "list_files",
      input: {},
      output: {
        files: [
          "/src/app.tsx",
          "/src/components/logo.tsx",
          "/src/components/header.tsx",
          "/src/styles/tokens.css",
        ],
      },
    }),
  },
  {
    id: "grep-files",
    label: "grep_files",
    message: toolMessage({
      id: "grep-files",
      toolName: "grep_files",
      input: { pattern: "Logo", path_prefix: "/src" },
      output: {
        matches: [
          {
            path: "/src/components/header.tsx",
            line: 12,
            text: 'import { Logo } from "./logo";',
          },
          {
            path: "/src/components/logo.tsx",
            line: 4,
            text: "export function Logo() {",
          },
        ],
        files_scanned: 14,
      },
    }),
  },
  {
    id: "todo-write",
    label: "todo_write",
    message: toolMessage({
      id: "todo-write",
      toolName: "todo_write",
      input: {
        todos: [
          {
            content: "Audit current tool cards",
            active_form: "Auditing current tool cards",
            status: "completed",
          },
          {
            content: "Design dedicated card bodies",
            active_form: "Designing dedicated card bodies",
            status: "in_progress",
          },
          {
            content: "Verify the preview route",
            active_form: "Verifying the preview route",
            status: "pending",
          },
        ],
      },
      output: { ok: true, count: 3 },
    }),
  },
  {
    id: "run-command",
    label: "run_command",
    message: toolMessage({
      id: "run-command",
      toolName: "run_command",
      input: {
        command: "pnpm",
        args: ["--filter", "editor", "typecheck"],
        description: "Typecheck editor",
      },
      output: {
        stdout: [
          "$ tsc --noEmit",
          "editor: typecheck completed",
          "packages/ui: typecheck completed",
        ].join("\n"),
        stderr: "warning: cache miss for editor typecheck",
        exit_code: 0,
        timed_out: false,
        truncated: false,
        duration_ms: 1842,
      },
    }),
  },
  {
    id: "skill",
    label: "skill",
    message: toolMessage({
      id: "skill",
      toolName: "skill",
      input: { name: "slides" },
      output: {
        content: [
          '<skill_content name="slides">',
          "# Slides",
          "",
          "Create slide decks as SVG pages inside a .canvas bundle.",
          "Use the provided template files before writing pages.",
          "</skill_content>",
        ].join("\n"),
      },
    }),
  },
  {
    id: "question",
    label: "question",
    message: toolMessage({
      id: "question",
      toolName: "question",
      input: {
        questions: [
          {
            question: "Which color scheme should I use?",
            options: [{ label: "Warm" }, { label: "Cool" }],
          },
        ],
      },
      output: { answers: [["Cool"]] },
    }),
  },
  {
    id: "design-search",
    label: "design_search",
    message: toolMessage({
      id: "design-search",
      toolName: "design_search",
      input: { query: "minimal gradient poster" },
      output: {
        picked: [
          {
            id: "ref-1",
            title: "Reference 1",
            url: `data:image/png;base64,${SAMPLE_IMAGE_BASE64}`,
          },
          {
            id: "ref-2",
            title: "Reference 2",
            url: `data:image/png;base64,${SAMPLE_IMAGE_BASE64}`,
          },
        ],
      },
    }),
  },
  {
    id: "view-image",
    label: "view_image",
    message: toolMessage({
      id: "view-image",
      toolName: "view_image",
      input: { path: "/assets/logo.png" },
      output: {
        ok: true,
        mime: "image/png",
        width: 96,
        height: 64,
        bytes: 280,
        data: SAMPLE_IMAGE_BASE64,
      },
    }),
  },
  {
    id: "generate-image",
    label: "generate_image",
    message: toolMessage({
      id: "generate-image",
      toolName: "generate_image",
      input: {
        prompt: GENERATE_IMAGE_PROMPT,
        references: GENERATE_IMAGE_REFERENCES,
      },
      output: {
        ok: true,
        path: "/assets/generated/logo-mark.png",
        mime: "image/png",
        width: 96,
        height: 64,
        bytes: 280,
        data: SAMPLE_IMAGE_BASE64,
      },
    }),
  },
  {
    id: "generate-image-pending",
    label: "generate_image · pending",
    message: toolMessage({
      id: "generate-image-pending",
      toolName: "generate_image",
      input: {
        prompt: GENERATE_IMAGE_PROMPT,
        references: GENERATE_IMAGE_REFERENCES,
      },
      state: "input-available",
    }),
  },
  {
    id: "generic",
    label: "unknown tool",
    message: toolMessage({
      id: "generic",
      toolName: "search_web",
      input: { query: "svg viewBox best practices" },
      output: { ok: true, results: 3 },
    }),
  },
];

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
    id: "lifecycle-pending",
    label: "Awaiting first token (Thinking)",
    group: "Lifecycle",
    // The dead-air window after a send, before the first chunk. The user
    // message is settled; the assistant turn hasn't begun, so the tail shows
    // the "Thinking" shimmer (its elapsed timer reveals after a few seconds).
    pending: true,
    initial_messages: [
      userMsg(
        "Refactor the logo into its own component and tighten the viewBox."
      ),
    ],
    chunks: [],
  },
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
      output: {
        content: "export default function App() {\n  return <main />;\n}\n",
        version: 7,
      },
    }),
  },
  {
    id: "action-edit",
    label: "Edit (3 occurrences)",
    group: "Actions",
    chunks: toolCall({
      toolCallId: "c1",
      toolName: "edit_file",
      input: {
        path: "/src/components/header.tsx",
        old_string: RICH_EDIT_OLD,
        new_string: RICH_EDIT_NEW,
        version: 7,
      },
      output: { ok: true, version: 8, occurrences: 3 },
    }),
  },
  {
    id: "action-write",
    label: "Write",
    group: "Actions",
    chunks: toolCall({
      toolCallId: "c1",
      toolName: "write_file",
      input: {
        path: "/src/components/logo-card.tsx",
        content: RICH_WRITE_CONTENT,
      },
      output: { ok: true, version: 1 },
    }),
  },
  {
    id: "action-list",
    label: "List files",
    group: "Actions",
    chunks: toolCall({
      toolCallId: "c1",
      toolName: "list_files",
      input: {},
      output: {
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
      input: { pattern: "useChat", path_prefix: "/src" },
      output: {
        matches: [
          {
            path: "/src/chat.tsx",
            line: 126,
            text: "const { messages } = useChat({ chat });",
          },
          {
            path: "/src/workspace-chat.tsx",
            line: 169,
            text: 'const isStreaming = status === "streaming";',
          },
        ],
        files_scanned: 18,
      },
    }),
  },
  {
    id: "action-plan",
    label: "Plan (todos)",
    group: "Actions",
    chunks: toolCall({
      toolCallId: "c1",
      toolName: "todo_write",
      input: {
        todos: [
          {
            content: "Audit current tool cards",
            active_form: "Auditing current tool cards",
            status: "completed",
          },
          {
            content: "Design dedicated card bodies",
            active_form: "Designing dedicated card bodies",
            status: "in_progress",
          },
          {
            content: "Verify in the preview route",
            active_form: "Verifying in the preview route",
            status: "pending",
          },
        ],
      },
      output: { ok: true, count: 3 },
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
      output: {
        stdout: "editor: typecheck completed\npackages/ui: typecheck completed",
        stderr: "",
        exit_code: 0,
        timed_out: false,
        truncated: false,
        duration_ms: 1842,
      },
    }),
  },
  {
    id: "action-skill",
    label: "Skill",
    group: "Actions",
    chunks: toolCall({
      toolCallId: "c1",
      toolName: "skill",
      input: { name: "slides" },
      output: {
        content: [
          '<skill_content name="slides">',
          "# Slides",
          "",
          "Create slide decks as SVG pages inside a .canvas bundle.",
          "Use the provided template files before writing pages.",
          "</skill_content>",
        ].join("\n"),
      },
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
      output: {
        ok: false,
        reason: "not_found",
        message: "No matching snippet found.",
      },
    }),
  },

  // --- Question (ask-user survey) ---
  // The locked `question` tool's interactive card. At `input-available` the run
  // is paused on the user, so the survey form renders; submit/skip in the demo
  // calls `chat.addToolResult`, flipping the part to `output-available` (the
  // read-only summary). Pure UI surface — no model call.
  {
    id: "question-single",
    label: "Single choice",
    group: "Question",
    chunks: toolCall({
      toolCallId: "q1",
      toolName: "question",
      state: "input-available",
      input: {
        questions: [
          {
            question: "Which color scheme should I use for the poster?",
            header: "Color scheme",
            options: [
              {
                label: "Warm",
                description: "Reds, oranges, yellows — energetic.",
              },
              { label: "Cool", description: "Blues, greens, purples — calm." },
              { label: "Monochrome", description: "One hue or black & white." },
            ],
          },
        ],
      },
    }),
  },
  {
    id: "question-multi",
    label: "Multi-select",
    group: "Question",
    chunks: toolCall({
      toolCallId: "q1",
      toolName: "question",
      state: "input-available",
      input: {
        questions: [
          {
            question: "Which sections should the landing page include?",
            header: "Sections",
            multi_select: true,
            options: [
              { label: "Hero" },
              { label: "Features" },
              { label: "Pricing" },
              { label: "Testimonials" },
              { label: "FAQ" },
            ],
          },
        ],
      },
    }),
  },
  {
    id: "question-freetext",
    label: "Free text only",
    group: "Question",
    chunks: toolCall({
      toolCallId: "q1",
      toolName: "question",
      state: "input-available",
      input: { questions: [{ question: "What should the headline say?" }] },
    }),
  },
  {
    id: "question-survey",
    label: "Survey (multiple questions)",
    group: "Question",
    chunks: toolCall({
      toolCallId: "q1",
      toolName: "question",
      state: "input-available",
      input: {
        questions: [
          {
            question: "Which color scheme?",
            header: "Color",
            options: [
              { label: "Warm" },
              { label: "Cool" },
              { label: "Monochrome" },
            ],
          },
          {
            question: "Which sections to include?",
            header: "Sections",
            multi_select: true,
            options: [
              { label: "Hero" },
              { label: "Features" },
              { label: "Pricing" },
            ],
          },
          { question: "Any other requirements?" },
        ],
      },
    }),
  },
  {
    id: "question-answered",
    label: "Answered (summary)",
    group: "Question",
    chunks: toolCall({
      toolCallId: "q1",
      toolName: "question",
      state: "output-available",
      input: {
        questions: [
          {
            question: "Which color scheme?",
            options: [{ label: "Warm" }, { label: "Cool" }],
          },
        ],
      },
      output: { answers: [["Cool"]] },
    }),
  },
  {
    id: "question-skipped",
    label: "Skipped",
    group: "Question",
    chunks: toolCall({
      toolCallId: "q1",
      toolName: "question",
      state: "output-available",
      input: { questions: [{ question: "Which color scheme?" }] },
      output: { answers: [], skipped: true },
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
    id: "long-user-message",
    label: "Long user message (collapsible)",
    group: "Markdown",
    // The pasted spec overflows the user bubble's collapse threshold, so it
    // renders clamped behind a fade with a "Show more" toggle; the streamed
    // reply confirms the assistant turn still flows normally below it.
    initial_messages: [userMsg(LONG_USER_MESSAGE)],
    chunks: text(
      "t1",
      "Got it — I'll start by extracting `<Logo>` into `src/logo.tsx`, then tighten the viewBox to `0 0 24 24`."
    ),
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

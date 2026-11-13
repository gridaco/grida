/**
 * Static tool-card messages for the chat kit's tool-card gallery.
 */

import type { UIMessage } from "ai";

export type ToolCardDemo = {
  id: string;
  label: string;
  message: UIMessage;
};

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

function pendingImageGroupMessage(): UIMessage {
  return {
    id: "tool-demo-generate-image-pair-pending",
    role: "assistant",
    parts: [
      {
        type: "tool-generate_image",
        toolCallId: "tool-demo-generate-image-pair-pending-1",
        state: "input-available",
        input: {
          prompt: "A refined editorial still life on a warm neutral backdrop.",
        },
      },
      {
        type: "tool-generate_image",
        toolCallId: "tool-demo-generate-image-pair-pending-2",
        state: "input-available",
        input: {
          prompt: "A bold abstract poster with restrained cobalt accents.",
        },
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
      input: { initial_search_query: "minimal gradient poster" },
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
    id: "generate-image-pair-pending",
    label: "generate_image × 2 · pending",
    message: pendingImageGroupMessage(),
  },
  {
    id: "surface-open",
    label: "surface_open",
    message: toolMessage({
      id: "surface-open",
      toolName: "surface_open",
      input: { path: "/launch-campaign.canvas" },
      output: {
        path: "/launch-campaign.canvas",
        requested: true,
        reason: "requested",
      },
    }),
  },
  {
    id: "surface-list-open",
    label: "surface_list_open",
    message: toolMessage({
      id: "surface-list-open",
      toolName: "surface_list_open",
      input: {},
      output: {
        interactive: true,
        active: "/launch-campaign.canvas",
        open: [
          "/launch-campaign.canvas",
          "/research/visual-directions.md",
          "/assets/hero-reference.webp",
        ],
      },
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

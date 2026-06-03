"use client";

/**
 * `AgentComposerInput` — the desktop agent chat's input, built on the
 * `@/kits/composer` Tiptap kit. Replaces the plain `PromptInputTextarea`
 * so the chat input gains slash `/` commands (skills) and `@` mentions
 * (workspace file references), plus light rich text.
 *
 * Headless-ish: the caller supplies the `catalog` (commands + mentions)
 * and a `toolbar` (e.g. the model picker), and receives the lowered
 * prompt text on submit. The composer owns trigger state + editing; this
 * component owns the surrounding frame + send/stop affordances.
 *
 * Lowering: the prompt is `message.meta.text` plus an explicit list of
 * any referenced file paths (from `@`-mentions / file-ref parts) so the
 * agent can resolve them even when the chip text alone is ambiguous.
 */

import { useMemo, type ReactNode } from "react";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/lib/utils/index";
import {
  ComposerContent,
  ComposerProvider,
  ComposerTriggerMenu,
  useComposer,
  type ComposerCatalog,
  type ComposerMessage,
} from "@/kits/composer";

/**
 * A `/`-command that runs an action (e.g. `/compact`) instead of being
 * lowered into the prompt. Shown in the trigger menu; intercepted on
 * submit. Distinct from skill commands, which become a prompt hint.
 */
export type ComposerCommandAction = {
  id: string;
  title: string;
  description?: string;
  run: () => void | Promise<void>;
};

export type AgentComposerInputProps = {
  catalog: ComposerCatalog;
  /** Action `/`-commands (e.g. `/compact`). Merged into the menu, ahead
   *  of the catalog's own commands, and intercepted on submit. */
  commandActions?: ComposerCommandAction[];
  /** Receives the lowered prompt text. Empty submissions are filtered. */
  onSubmit: (text: string) => void | Promise<void>;
  isStreaming: boolean;
  onStop: () => void;
  placeholder?: string;
  autofocus?: boolean;
  /** Left-aligned footer content (e.g. the model picker). */
  toolbar?: ReactNode;
  className?: string;
};

export function AgentComposerInput({
  catalog,
  commandActions,
  ...rest
}: AgentComposerInputProps) {
  // Surface action commands in the `/` menu alongside catalog commands.
  const effectiveCatalog = useMemo<ComposerCatalog>(() => {
    if (!commandActions || commandActions.length === 0) return catalog;
    const actionCommands = commandActions.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
    }));
    return {
      commands: [...actionCommands, ...catalog.commands],
      mentions: catalog.mentions,
    };
  }, [catalog, commandActions]);

  return (
    <ComposerProvider catalog={effectiveCatalog}>
      <AgentComposerInner commandActions={commandActions} {...rest} />
    </ComposerProvider>
  );
}

function AgentComposerInner({
  commandActions,
  onSubmit,
  isStreaming,
  onStop,
  placeholder = "Ask anything…",
  autofocus,
  toolbar,
  className,
}: Omit<AgentComposerInputProps, "catalog">) {
  const composer = useComposer();

  const actionById = useMemo(() => {
    const map = new Map<string, ComposerCommandAction>();
    for (const a of commandActions ?? []) map.set(a.id, a);
    return map;
  }, [commandActions]);

  const submit = () => {
    if (isStreaming) return;
    const message = composer.submit({ submitted_at: Date.now() });
    if (!message) return;
    // Intercept action commands (`/compact`, …) — run them instead of
    // sending a normal turn.
    const actions = message.parts
      .filter((p) => p.type === "command")
      .map((p) => (p as { id: string }).id)
      .filter((id) => actionById.has(id));
    if (actions.length > 0) {
      composer.clear();
      for (const id of actions) void actionById.get(id)!.run();
      return;
    }
    const text = lowerPrompt(message);
    if (!text.trim()) return;
    composer.clear();
    void onSubmit(text);
  };

  return (
    <div
      className={cn(
        "relative rounded-lg border bg-accent transition-colors",
        className
      )}
    >
      <ComposerTriggerMenu />
      <ComposerContent
        autofocus={autofocus}
        onSubmitRequest={submit}
        placeholder={placeholder}
        className="px-3 pt-2"
        editorClassName="min-h-9 max-h-48 overflow-y-auto text-sm"
      />
      <div className="flex items-center gap-1 px-2 pb-2 pt-1">
        {toolbar}
        <div className="ml-auto">
          {isStreaming ? (
            <Button
              type="button"
              size="icon-sm"
              className="rounded-full"
              onClick={onStop}
              aria-label="Stop"
            >
              <SquareIcon className="size-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon-sm"
              className="rounded-full"
              onClick={submit}
              aria-label="Send"
            >
              <ArrowUpIcon className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Build the prompt text the agent receives. Starts from the composer's
 * plain text, then appends:
 *   - any referenced file paths (`@`-mentions / file-refs) as an explicit
 *     list so the agent can resolve them, and
 *   - any `/`-command (skill) requests as a hint so the agent loads the
 *     named skill via its `skill` tool.
 */
function lowerPrompt(message: ComposerMessage): string {
  const paths = new Set<string>();
  const skills = new Set<string>();
  for (const part of message.parts) {
    if (part.type === "mention" && part.target.path) {
      paths.add(part.target.path);
    } else if (part.type === "file-ref") {
      paths.add(part.ref.path);
    } else if (part.type === "command") {
      skills.add(part.id);
    }
  }
  const sections = [message.meta.text.trim()];
  if (paths.size > 0) {
    sections.push(
      `Referenced files:\n${[...paths].map((p) => `- ${p}`).join("\n")}`
    );
  }
  if (skills.size > 0) {
    sections.push(`Use these skills: ${[...skills].join(", ")}.`);
  }
  return sections.filter((s) => s.length > 0).join("\n\n");
}

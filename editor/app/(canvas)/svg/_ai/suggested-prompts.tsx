"use client";

import { useEffect, useState } from "react";

/**
 * Starter prompts shown as badges on the empty conversation state. Click a
 * badge to seed the prompt input with its full text — the user still has to
 * press send. Badges hide the moment the input has any text, so a click can
 * never overwrite in-progress typing (and the click handler double-checks
 * before writing, in case of a state race).
 */
export type SuggestedPrompt = {
  /** Compact label shown on the badge. */
  title: string;
  /** Full text seeded into the prompt input on click. */
  prompt: string;
};

export const SUGGESTED_PROMPTS: readonly SuggestedPrompt[] = [
  {
    title: "Three blue circles",
    prompt: "Draw three blue circles in a row, centered on the canvas.",
  },
  {
    title: "Sunset gradient",
    prompt:
      "Add a soft sunset gradient background (orange to pink, top to bottom).",
  },
  {
    title: "Yellow star",
    prompt:
      "Add a small yellow five-pointed star at the top-center of the canvas.",
  },
  {
    title: "Recolor everything teal",
    prompt: "Recolor every shape to a slightly different shade of teal.",
  },
];

/**
 * Suggestion badges. Self-contained — talks to the textarea via DOM rather
 * than lifting `PromptInputProvider`, because the shared `AgentInput`
 * already owns its own provider. `name="message"` is the stable selector
 * that `PromptInputTextarea` sets on its underlying `<textarea>`.
 *
 * Props:
 * - `panelRef`: a ref to an ancestor that contains both this component and
 *   the input. The badges find the textarea by querying inside that root,
 *   so the search is scoped to one chat panel even if multiple are mounted.
 */
export function SuggestedPrompts({
  panelRef,
}: {
  panelRef: React.RefObject<HTMLElement | null>;
}) {
  const [isEmpty, setIsEmpty] = useState(true);

  // Mirror the textarea's emptiness into state so we can hide as soon as
  // the user types, and re-show if they delete back to empty.
  useEffect(() => {
    const root = panelRef.current;
    if (!root) return;

    const findTextarea = () =>
      root.querySelector<HTMLTextAreaElement>('textarea[name="message"]');

    const sync = () => {
      const ta = findTextarea();
      setIsEmpty(!ta || ta.value === "");
    };
    sync();

    // Bubbled input/change events cover both keystrokes and our own
    // programmatic dispatch in `onPick`.
    const onChange = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLTextAreaElement && t.name === "message") {
        setIsEmpty(t.value === "");
      }
    };
    root.addEventListener("input", onChange);
    return () => {
      root.removeEventListener("input", onChange);
    };
  }, [panelRef]);

  if (!isEmpty) return null;

  const onPick = (prompt: string) => {
    const ta = panelRef.current?.querySelector<HTMLTextAreaElement>(
      'textarea[name="message"]'
    );
    // Double safety: never overwrite an in-progress draft, even if a render
    // race somehow re-shows the badge while the textarea has content.
    if (!ta || ta.value !== "") return;

    // React-controlled inputs ignore plain `.value = …` because they track
    // the value via their own setter. Going through the native descriptor
    // is the standard "poke a controlled input from outside" pattern.
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    if (!setter) return;
    setter.call(ta, prompt);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.focus();
  };

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-1.5 px-4 pt-2"
      aria-label="Suggested prompts"
    >
      {SUGGESTED_PROMPTS.map((p) => (
        <button
          key={p.title}
          type="button"
          onClick={() => onPick(p.prompt)}
          title={p.prompt}
          className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          {p.title}
        </button>
      ))}
    </div>
  );
}

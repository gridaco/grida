/**
 * Workspace-local Start surface. This is a faux tab shown only while the real
 * editor group is empty; it never enters tab history or the agent's open-surface
 * state.
 */
"use client";

import { type ReactNode, useRef, useState } from "react";
import {
  FolderOpenIcon,
  ImagesIcon,
  Loader2Icon,
  PresentationIcon,
  ShapesIcon,
} from "lucide-react";
import { Kbd } from "@app/ui/components/kbd";
import { cn } from "@app/ui/lib/utils";
import type { WorkspaceCanvasCreation } from "./workspace-canvas-creation";

export function EditorPaneStart({
  onOpenFileExplorer,
  onCreateCanvas,
}: {
  onOpenFileExplorer: () => void;
  onCreateCanvas: (editor: WorkspaceCanvasCreation.Editor) => Promise<void>;
}) {
  const [creating, setCreating] =
    useState<WorkspaceCanvasCreation.Editor | null>(null);
  const [error, setError] = useState<string | null>(null);
  // State disables the rows on render; the ref also closes the same-tick
  // double-click window before React has rendered that disabled state.
  const creatingRef = useRef(false);

  const createCanvas = async (editor: WorkspaceCanvasCreation.Editor) => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(editor);
    setError(null);
    try {
      await onCreateCanvas(editor);
    } catch (err) {
      console.error(`[workspace-start] failed to create ${editor} canvas`, err);
      setError(
        editor === "board"
          ? "Couldn’t create the canvas. Please try again."
          : "Couldn’t create the slide deck. Please try again."
      );
    } finally {
      creatingRef.current = false;
      setCreating(null);
    }
  };

  return (
    <section
      data-testid="workspace-start"
      aria-label="Quick Start"
      className="flex size-full items-center justify-center px-6 py-8"
    >
      <div className="w-full max-w-xs">
        <div className="space-y-0.5">
          <StartAction
            icon={<FolderOpenIcon />}
            title="Open File Explorer"
            trailing={<Kbd>⌘B</Kbd>}
            onClick={onOpenFileExplorer}
          />
          <StartAction
            icon={
              creating === "board" ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <ShapesIcon />
              )
            }
            title="New freeform canvas"
            disabled={creating !== null}
            onClick={() => void createCanvas("board")}
          />
          <StartAction
            icon={
              creating === "slides" ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <PresentationIcon />
              )
            }
            title="New slide deck"
            disabled={creating !== null}
            onClick={() => void createCanvas("slides")}
          />
          <StartAction
            icon={<ImagesIcon />}
            title="Explore ideas"
            trailing={
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Coming soon
              </span>
            }
            disabled
          />
        </div>

        {error && (
          <p role="alert" className="mt-3 px-3 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

function StartAction({
  icon,
  title,
  trailing,
  disabled = false,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  trailing?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "group flex w-full select-none items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left outline-none transition-colors",
        "hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        disabled &&
          "cursor-not-allowed opacity-50 hover:bg-transparent focus-visible:bg-transparent"
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&>svg]:size-3.5">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
        {title}
      </span>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </button>
  );
}

"use client";

import Link from "next/link";
import {
  DownloadIcon,
  FileIcon,
  GitHubLogoIcon,
  OpenInNewWindowIcon,
  ResetIcon,
} from "@radix-ui/react-icons";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@app/ui/components/dropdown-menu";
import { sitemap } from "@/www/data/sitemap";
import { toggleInspectorDebug, useInspectorDebug } from "./use-inspector-debug";

/**
 * Minimal dropdown content for the SVG demo pages.
 *
 * Mirrors the playground's `PlaygroundMenuContent` pattern (File / Edit
 * sub-menus, separator, external links) but trimmed to only what the demo
 * actually wires: Open / Save / Reset and Undo / Redo. Sister-demo links
 * make it easy to jump between Free-form and Slides.
 */
export function SvgMenuContent({
  canUndo,
  canRedo,
  canCopy,
  onOpenFile,
  onSaveFile,
  onReset,
  onUndo,
  onRedo,
  onCopy,
  onCut,
  onPaste,
}: {
  canUndo: boolean;
  canRedo: boolean;
  /** Selection non-empty — gates Cut / Copy (Paste reads the clipboard). */
  canCopy: boolean;
  onOpenFile: () => void;
  onSaveFile: () => void;
  onReset: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
}) {
  const debug = useInspectorDebug();
  return (
    <DropdownMenuContent align="start" className="min-w-52">
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="text-xs">
          File
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-40">
          <DropdownMenuItem onClick={onOpenFile} className="text-xs">
            <FileIcon className="size-3.5" />
            Open SVG…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onSaveFile} className="text-xs">
            <DownloadIcon className="size-3.5" />
            Save SVG
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onReset} className="text-xs">
            <ResetIcon className="size-3.5" />
            Reset to sample
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="text-xs">
          Edit
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-40">
          <DropdownMenuItem
            onClick={onUndo}
            disabled={!canUndo}
            className="text-xs"
          >
            Undo
            <DropdownMenuShortcut>⌘Z</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onRedo}
            disabled={!canRedo}
            className="text-xs"
          >
            Redo
            <DropdownMenuShortcut>⇧⌘Z</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onCut}
            disabled={!canCopy}
            className="text-xs"
          >
            Cut
            <DropdownMenuShortcut>⌘X</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onCopy}
            disabled={!canCopy}
            className="text-xs"
          >
            Copy
            <DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onPaste} className="text-xs">
            Paste
            <DropdownMenuShortcut>⌘V</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="text-xs">
          Examples
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-40">
          <Link href="/svg/examples/default">
            <DropdownMenuItem className="text-xs">
              <OpenInNewWindowIcon className="size-3.5" />
              Free-form
            </DropdownMenuItem>
          </Link>
          <Link href="/svg/examples/slides">
            <DropdownMenuItem className="text-xs">
              <OpenInNewWindowIcon className="size-3.5" />
              Slides
            </DropdownMenuItem>
          </Link>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuCheckboxItem
        checked={debug}
        onSelect={(e) => {
          e.preventDefault();
          toggleInspectorDebug();
        }}
        className="text-xs"
      >
        Debug mode
      </DropdownMenuCheckboxItem>
      <DropdownMenuSeparator />
      <Link href={sitemap.links.github} target="_blank">
        <DropdownMenuItem className="text-xs">
          <GitHubLogoIcon className="size-3.5" />
          GitHub
        </DropdownMenuItem>
      </Link>
    </DropdownMenuContent>
  );
}

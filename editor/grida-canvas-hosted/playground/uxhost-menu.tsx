"use client";

import React, { useEffect, useState } from "react";
import { useEditorState, useCurrentEditor } from "@/grida-canvas-react";
import { useBackendState } from "@/grida-canvas-react/provider";
import {
  DownloadIcon,
  FigmaLogoIcon,
  FileIcon,
  GitHubLogoIcon,
  MixIcon,
  OpenInNewWindowIcon,
  FontBoldIcon,
  FontItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
  TextAlignLeftIcon,
  TextAlignCenterIcon,
  TextAlignRightIcon,
  TextAlignJustifyIcon,
  TextAlignTopIcon,
  TextAlignMiddleIcon,
  TextAlignBottomIcon,
  LetterCaseToggleIcon,
  LetterCaseUppercaseIcon,
  LetterCaseLowercaseIcon,
  LetterCaseCapitalizeIcon,
  FrameIcon,
  GroupIcon,
  TransformIcon,
  EyeOpenIcon,
  EyeNoneIcon,
  LockClosedIcon,
  LockOpen1Icon,
  LayersIcon,
  Component1Icon,
  AlignTopIcon,
  AlignRightIcon,
  AlignLeftIcon,
  AlignBottomIcon,
  AlignCenterHorizontallyIcon,
  AlignCenterVerticallyIcon,
  SpaceEvenlyHorizontallyIcon,
  SpaceEvenlyVerticallyIcon,
} from "@radix-ui/react-icons";
import { useTheme } from "next-themes";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { saveAs } from "file-saver";
import { v4 } from "uuid";
import { nanoid } from "nanoid";
import Link from "next/link";
import { toast } from "sonner";
import {
  ImportFromFigmaDialog,
  ImportFromGridaFileJsonDialog,
} from "@/grida-canvas-react-starter-kit/starterkit-import";
import { canvas_examples } from "./examples";
import { sitemap } from "@/www/data/sitemap";
import iofigma from "@grida/io-figma";
import { editor } from "@/grida-canvas";
import { SettingsDialog } from "./uxhost-settings";
import {
  useInsertFile,
  useDataTransferEventTarget,
} from "@/grida-canvas-react/use-data-transfer";
import { io } from "@grida/io";
import { useFilePicker } from "use-file-picker";
import { ImageIcon } from "lucide-react";
import { SlackLogoIcon } from "@/components/logos";
import { distro } from "../distro";
import { keyboardShortcutText } from "./uxhost-shortcut-renderer";

export function PlaygroundMenuContent({
  toggleVisibility,
  toggleMinimal,
}: {
  toggleVisibility?: () => void;
  toggleMinimal?: () => void;
} = {}) {
  const instance = useCurrentEditor();
  const importFromFigmaDialog = useDialogState("import-from-figma");
  const importFromJson = useDialogState("import-from-json", {
    refreshkey: true,
  });
  const settingsDialog = useDialogState("settings");
  const [settingsInitialPage, setSettingsInitialPage] = useState<
    "keybindings" | "general"
  >("keybindings");
  const { insertFromFile } = useInsertFile();
  const { onpaste_external_event } = useDataTransferEventTarget();
  const { openFilePicker, plainFiles } = useFilePicker({
    accept: "image/png,image/jpeg,image/webp,image/svg+xml",
    multiple: true,
  });

  // Get editor state for View menu
  const ruler = useEditorState(instance, (state) => state.ruler);
  const pixelgrid = useEditorState(instance, (state) => state.pixelgrid);
  const outline_mode = useEditorState(instance, (state) => state.outline_mode);
  const outline_mode_ignores_clips = useEditorState(
    instance,
    (state) => state.outline_mode_ignores_clips
  );
  const pixelpreview = useEditorState(instance, (state) => state.pixelpreview);

  // Get editor state for Edit menu
  const selection = useEditorState(instance, (state) => state.selection);
  const backend = useBackendState();
  const hasSelection = selection.length > 0;

  const onExport = () => {
    const blob = instance.archive();
    saveAs(blob, distro.snapshot_file_name());
  };

  const handleImportImageClick = () => {
    openFilePicker();
  };

  // Handle files when they are selected
  useEffect(() => {
    if (plainFiles.length === 0) return;

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    for (let i = 0; i < plainFiles.length; i++) {
      const file = plainFiles[i];
      const [valid, type] = io.clipboard.filetype(file);
      if (valid) {
        insertFromFile(type, file, {
          clientX: centerX,
          clientY: centerY,
        });
      } else {
        toast.error(`File type '${type}' is not supported`);
      }
    }
  }, [plainFiles, insertFromFile]);

  return (
    <>
      <ImportFromGridaFileJsonDialog
        key={importFromJson.refreshkey}
        {...importFromJson.props}
        onImport={(file) => {
          if (
            file.assets?.images &&
            Object.keys(file.assets.images).length > 0
          ) {
            instance.loadImages(file.assets.images);
          }
          instance.commands.reset(
            editor.state.init({
              editable: true,
              document: file.document,
            }),
            Date.now() + ""
          );
        }}
      />

      <ImportFromFigmaDialog
        {...importFromFigmaDialog.props}
        onImport={async (res) => {
          const images = res.images ?? {};
          const context: iofigma.restful.factory.FactoryContext = {
            gradient_id_generator: () => v4(),
            resolve_image_src: (ref) =>
              ref in images ? `res://images/${ref}` : null,
          };
          const { document: gridaDoc, imageRefsUsed } =
            iofigma.restful.factory.document(
              res.document as any,
              images,
              context
            );

          const refToBytes: Record<string, Uint8Array> = {};
          for (const ref of imageRefsUsed) {
            if (!(ref in images)) continue;
            const url = images[ref];
            if (!url) continue;
            try {
              const resp = await fetch(url);
              if (resp.ok) {
                const buf = await resp.arrayBuffer();
                refToBytes[ref] = new Uint8Array(buf);
              }
            } catch (e) {
              console.warn(`Failed to fetch image for ref ${ref}`, e);
            }
          }

          if (Object.keys(refToBytes).length > 0) {
            instance.loadImages(refToBytes);
          }

          instance.surface.insert({ document: gridaDoc });
        }}
        onImportFig={async (result) => {
          const iofigma = await import("@grida/io-figma");
          const FigImporter = iofigma.default.kiwi.FigImporter;

          // Parse the .fig file
          const buffer = await result.file.arrayBuffer();
          const figFile = FigImporter.parseFile(new Uint8Array(buffer));

          // TODO: Future enhancement - support importing entire document as single operation
          // Currently loops per-scene for simplicity and to avoid bugs

          // Process each page as a separate scene
          for (const page of figFile.pages) {
            const sceneId = `scene-${nanoid()}`;
            instance.surface.surfaceCreateScene({
              id: sceneId,
              name: page.name,
            });

            if (page.rootNodes.length > 0) {
              const { document: packedDoc } = FigImporter.convertPageToScene(
                page,
                {
                  gradient_id_generator: () => v4(),
                }
              );
              instance.surface.insert({ document: packedDoc });
            }
          }
        }}
      />

      <SettingsDialog
        {...settingsDialog.props}
        initialPage={settingsInitialPage}
      />

      <DropdownMenuContent align="start" className="min-w-52">
        <FileMenuContent
          onExport={onExport}
          onImportJson={importFromJson.openDialog}
          onImportImage={handleImportImageClick}
          onImportFigma={importFromFigmaDialog.openDialog}
        />
        <EditMenuContent
          hasSelection={hasSelection}
          backend={backend}
          onPaste={onpaste_external_event}
        />
        <ViewMenuContent
          pixelgrid={pixelgrid}
          ruler={ruler}
          outline_mode={outline_mode}
          outline_mode_ignores_clips={outline_mode_ignores_clips}
          pixelpreview={pixelpreview}
          toggleVisibility={toggleVisibility}
          toggleMinimal={toggleMinimal}
        />
        <ObjectMenuContent />
        <TextMenuContent />
        <ArrangeMenuContent />
        <SettingsMenuContent
          onOpenGeneral={() => {
            setSettingsInitialPage("general");
            settingsDialog.openDialog();
          }}
          onOpenKeybindings={() => {
            setSettingsInitialPage("keybindings");
            settingsDialog.openDialog();
          }}
        />
        <PreferencesMenuContent />
        <DevelopersMenuContent />
        <DropdownMenuSeparator />
        <Link href={sitemap.links.github} target="_blank">
          <DropdownMenuItem className="text-xs">
            <GitHubLogoIcon className="size-3.5" />
            GitHub
          </DropdownMenuItem>
        </Link>
        <Link href={sitemap.links.slack} target="_blank">
          <DropdownMenuItem className="text-xs">
            <SlackLogoIcon className="size-3.5" />
            Slack Community
          </DropdownMenuItem>
        </Link>
      </DropdownMenuContent>
    </>
  );
}

function FileMenuContent({
  onExport,
  onImportJson,
  onImportImage,
  onImportFigma,
}: {
  onExport: () => void;
  onImportJson: () => void;
  onImportImage: () => void;
  onImportFigma: () => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="text-xs">File</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-40">
        <DropdownMenuItem onClick={onImportJson} className="text-xs">
          <FileIcon className="size-3.5" />
          Open .grida
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExport} className="text-xs">
          <DownloadIcon className="size-3.5" />
          Save as .grida
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onImportImage} className="text-xs">
          <ImageIcon className="size-3.5" />
          Import Image
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onImportFigma} className="text-xs">
          <FigmaLogoIcon className="size-3.5" />
          Import Figma
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function EditMenuContent({
  hasSelection,
  backend,
  onPaste,
}: {
  hasSelection: boolean;
  backend: string;
  onPaste: () => void;
}) {
  const instance = useCurrentEditor();

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="text-xs">Edit</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-40">
        {/* History Section */}
        <DropdownMenuItem
          onClick={() => instance.commands.undo()}
          className="text-xs"
        >
          Undo
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.edit.undo")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.commands.redo()}
          className="text-xs"
        >
          Redo
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.edit.redo")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Clipboard Section */}
        <DropdownMenuItem
          onClick={() => instance.surface.a11yCut()}
          disabled={!hasSelection}
          className="text-xs"
        >
          Cut
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.edit.cut")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yCopy()}
          disabled={!hasSelection}
          className="text-xs"
        >
          Copy
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.edit.copy")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPaste} className="text-xs">
          Paste
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.edit.paste")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            const task = instance.surface.a11yCopyAsImage("png");
            toast.promise(task, {
              success: "Copied as PNG",
              error: "Failed to copy as PNG",
            });
          }}
          disabled={!hasSelection || backend !== "canvas"}
          className="text-xs"
        >
          Copy as PNG
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.edit.copy-as-png")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            void instance.surface.a11yCopyAsSVG();
          }}
          disabled={!hasSelection || backend !== "canvas"}
          className="text-xs"
        >
          Copy as SVG
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Color Picker */}
        <DropdownMenuItem
          onClick={() => instance.surface.surfacePickColor()}
          className="text-xs"
        >
          Pick color
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.edit.eye-dropper")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Actions Section */}
        <DropdownMenuItem
          onClick={() => instance.commands.duplicate("selection")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Duplicate
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.edit.duplicate")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yDelete()}
          disabled={!hasSelection}
          className="text-xs"
        >
          Delete
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.edit.delete-node")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function ViewMenuContent({
  pixelgrid,
  ruler,
  outline_mode,
  outline_mode_ignores_clips,
  pixelpreview,
  toggleVisibility,
  toggleMinimal,
}: {
  pixelgrid: string;
  ruler: string;
  outline_mode: string;
  outline_mode_ignores_clips: boolean;
  pixelpreview: string;
  toggleVisibility?: () => void;
  toggleMinimal?: () => void;
}) {
  const instance = useCurrentEditor();

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="text-xs">View</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-40">
        {/* Zoom Controls */}
        <DropdownMenuCheckboxItem
          checked={false}
          onSelect={() => instance.camera.zoomIn()}
          className="text-xs"
        >
          Zoom in
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.view.zoom-in")}
          </DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={false}
          onSelect={() => instance.camera.zoomOut()}
          className="text-xs"
        >
          Zoom out
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.view.zoom-out")}
          </DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={false}
          onSelect={() => instance.camera.scale(1, "center")}
          className="text-xs"
        >
          Zoom to 100%
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.view.zoom-to-100")}
          </DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={false}
          onSelect={() => instance.camera.fit("*")}
          className="text-xs"
        >
          Zoom to fit
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.view.zoom-to-fit")}
          </DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={false}
          onSelect={() => instance.camera.fit("selection")}
          className="text-xs"
        >
          Zoom to selection
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.view.zoom-to-selection")}
          </DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {/* Display Options */}
        <DropdownMenuCheckboxItem
          checked={pixelpreview !== "disabled"}
          onSelect={() => {
            instance.surface.surfaceTogglePixelPreview();
          }}
          className="text-xs"
        >
          Pixel preview
          <DropdownMenuShortcut>
            {keyboardShortcutText(
              "workbench.surface.view.toggle-pixel-preview"
            )}
          </DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={pixelgrid === "on"}
          onSelect={() => {
            instance.surface.surfaceTogglePixelGrid();
          }}
          className="text-xs"
        >
          Pixel grid
          <DropdownMenuShortcut>
            {keyboardShortcutText(
              "workbench.surface.view.hide-show-pixel-grid"
            )}
          </DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={ruler === "on"}
          onSelect={() => {
            instance.surface.surfaceToggleRuler();
          }}
          className="text-xs"
        >
          Ruler
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.view.hide-show-ruler")}
          </DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            Outlines
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40">
            <DropdownMenuCheckboxItem
              checked={outline_mode === "on"}
              onSelect={() => {
                instance.surface.surfaceToggleOutlineMode();
              }}
              className="text-xs"
            >
              Show outlines
              <DropdownMenuShortcut>
                {keyboardShortcutText(
                  "workbench.surface.view.toggle-outline-mode"
                )}
              </DropdownMenuShortcut>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={outline_mode_ignores_clips}
              disabled={outline_mode !== "on"}
              onSelect={() => {
                instance.surface.surfaceToggleOutlineModeIgnoresClips();
              }}
              className="text-xs"
            >
              Ignore clips content
            </DropdownMenuCheckboxItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {/* UI Visibility */}
        {toggleVisibility && toggleMinimal && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={toggleVisibility} className="text-xs">
              Show/Hide UI
            </DropdownMenuItem>
            <DropdownMenuItem onClick={toggleMinimal} className="text-xs">
              Minimize UI
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function PreferencesMenuContent() {
  const { theme, setTheme } = useTheme();
  const resolvedTheme = theme ?? "system";

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="text-xs">
        Preferences
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-40">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40">
            <DropdownMenuRadioGroup
              value={resolvedTheme}
              onValueChange={(value) => setTheme(value)}
            >
              <DropdownMenuRadioItem value="light" className="text-xs">
                Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark" className="text-xs">
                Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system" className="text-xs">
                System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function SettingsMenuContent({
  onOpenGeneral,
  onOpenKeybindings,
}: {
  onOpenGeneral: () => void;
  onOpenKeybindings: () => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="text-xs">
        Settings
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-40">
        <DropdownMenuItem onClick={onOpenGeneral} className="text-xs">
          General
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenKeybindings} className="text-xs">
          Keyboard shortcuts
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function DevelopersMenuContent() {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="text-xs">
        Developers
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-40">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            <OpenInNewWindowIcon className="size-3.5" />
            Tools
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40">
            <Link href="/canvas/tools/ai" target="_blank">
              <DropdownMenuItem className="text-xs">
                <OpenInNewWindowIcon className="size-3.5" />
                AI
              </DropdownMenuItem>
            </Link>
            <Link href="/canvas/tools/io-figma" target="_blank">
              <DropdownMenuItem className="text-xs">
                <OpenInNewWindowIcon className="size-3.5" />
                IO Figma
              </DropdownMenuItem>
            </Link>
            <Link href="/canvas/tools/io-svg" target="_blank">
              <DropdownMenuItem className="text-xs">
                <OpenInNewWindowIcon className="size-3.5" />
                IO SVG
              </DropdownMenuItem>
            </Link>
            <Link href="https://github.com/gridaco/p666" target="_blank">
              <DropdownMenuItem className="text-xs">
                <OpenInNewWindowIcon className="size-3.5" />
                P666 Daemon
              </DropdownMenuItem>
            </Link>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            <MixIcon className="size-3.5" />
            Examples
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40">
            {canvas_examples.map((example) => (
              <Link
                key={example.id}
                href={"/canvas/examples/" + example.id}
                target="_blank"
              >
                <DropdownMenuItem className="text-xs">
                  <OpenInNewWindowIcon className="size-3.5" />
                  {example.name}
                </DropdownMenuItem>
              </Link>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function TextMenuContent() {
  const instance = useCurrentEditor();
  const selection = useEditorState(instance, (state) => state.selection);
  const hasTextSelection = selection.some(
    (node_id) => instance.doc.getNodeSnapshotById(node_id)?.type === "tspan"
  );

  // Helper to apply command to all selected text nodes
  const applyToTextNodes = (fn: (node_id: string) => void) => {
    selection.forEach((node_id) => {
      const node = instance.doc.getNodeSnapshotById(node_id);
      if (node?.type === "tspan") {
        fn(node_id);
      }
    });
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="text-xs">Text</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-40">
        {/* Basic Formatting */}
        <DropdownMenuItem
          onClick={() => instance.surface.a11yToggleBold("selection")}
          disabled={!hasTextSelection}
          className="text-xs"
        >
          <FontBoldIcon className="size-3.5" />
          Bold
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.text.toggle-bold")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yToggleItalic("selection")}
          disabled={!hasTextSelection}
          className="text-xs"
        >
          <FontItalicIcon className="size-3.5" />
          Italic
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.text.toggle-italic")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yToggleUnderline("selection")}
          disabled={!hasTextSelection}
          className="text-xs"
        >
          <UnderlineIcon className="size-3.5" />
          Underline
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.text.toggle-underline")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yToggleLineThrough("selection")}
          disabled={!hasTextSelection}
          className="text-xs"
        >
          <StrikethroughIcon className="size-3.5" />
          Strikethrough
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.text.toggle-line-through")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        {/* Create link - disabled */}
        {/* TODO: Implement Create link */}
        <DropdownMenuItem disabled className="text-xs">
          Create link
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.text.create-link")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        {/* Lists - disabled */}
        {/* TODO: Implement Bulleted list */}
        <DropdownMenuItem disabled className="text-xs">
          Bulleted list
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.text.ul")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        {/* TODO: Implement Numbered list */}
        <DropdownMenuItem disabled className="text-xs">
          Numbered list
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.text.ol")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Alignment */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            Alignment
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40">
            <DropdownMenuItem
              onClick={() =>
                instance.surface.a11yTextAlign("selection", "left")
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              <TextAlignLeftIcon className="size-3.5" />
              Text align left
              <DropdownMenuShortcut>
                {keyboardShortcutText("workbench.surface.text.text-align-left")}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                instance.surface.a11yTextAlign("selection", "center")
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              <TextAlignCenterIcon className="size-3.5" />
              Text align center
              <DropdownMenuShortcut>
                {keyboardShortcutText(
                  "workbench.surface.text.text-align-center"
                )}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                instance.surface.a11yTextAlign("selection", "right")
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              <TextAlignRightIcon className="size-3.5" />
              Text align right
              <DropdownMenuShortcut>
                {keyboardShortcutText(
                  "workbench.surface.text.text-align-right"
                )}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                instance.surface.a11yTextAlign("selection", "justify")
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              <TextAlignJustifyIcon className="size-3.5" />
              Text align justified
              <DropdownMenuShortcut>
                {keyboardShortcutText(
                  "workbench.surface.text.text-align-justify"
                )}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                instance.surface.a11yTextVerticalAlign("selection", "top")
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              <TextAlignTopIcon className="size-3.5" />
              Text align top
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                instance.surface.a11yTextVerticalAlign("selection", "center")
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              <TextAlignMiddleIcon className="size-3.5" />
              Text align middle
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                instance.surface.a11yTextVerticalAlign("selection", "bottom")
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              <TextAlignBottomIcon className="size-3.5" />
              Text align bottom
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {/* Adjust */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            Adjust
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40">
            {/* Indentation - disabled */}
            {/* TODO: Implement Increase indentation */}
            <DropdownMenuItem disabled className="text-xs">
              Increase indentation
              <DropdownMenuShortcut>
                {keyboardShortcutText(
                  "workbench.surface.text.increase-indentation"
                )}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            {/* TODO: Implement Decrease indentation */}
            <DropdownMenuItem disabled className="text-xs">
              Decrease indentation
              <DropdownMenuShortcut>
                {keyboardShortcutText(
                  "workbench.surface.text.decrease-indentation"
                )}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Font size */}
            <DropdownMenuItem
              onClick={() =>
                instance.surface.a11yChangeTextFontSize("selection", 1)
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              Increase font size
              <DropdownMenuShortcut>
                {keyboardShortcutText(
                  "workbench.surface.text.increase-font-size"
                )}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                instance.surface.a11yChangeTextFontSize("selection", -1)
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              Decrease font size
              <DropdownMenuShortcut>
                {keyboardShortcutText(
                  "workbench.surface.text.decrease-font-size"
                )}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            {/* Font weight */}
            <DropdownMenuItem
              onClick={() =>
                instance.surface.a11yChangeTextFontWeight(
                  "selection",
                  "increase"
                )
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              Increase font weight
              <DropdownMenuShortcut>
                {keyboardShortcutText(
                  "workbench.surface.text.increase-font-weight"
                )}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                instance.surface.a11yChangeTextFontWeight(
                  "selection",
                  "decrease"
                )
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              Decrease font weight
              <DropdownMenuShortcut>
                {keyboardShortcutText(
                  "workbench.surface.text.decrease-font-weight"
                )}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Line height */}
            <DropdownMenuItem
              onClick={() =>
                instance.surface.a11yChangeTextLineHeight("selection", 1)
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              Increase line height
              <DropdownMenuShortcut>
                {keyboardShortcutText(
                  "workbench.surface.text.increase-line-height"
                )}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                instance.surface.a11yChangeTextLineHeight("selection", -1)
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              Decrease line height
              <DropdownMenuShortcut>
                {keyboardShortcutText(
                  "workbench.surface.text.decrease-line-height"
                )}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            {/* Letter spacing */}
            <DropdownMenuItem
              onClick={() =>
                instance.surface.a11yChangeTextLetterSpacing("selection", 0.1)
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              Increase letter spacing
              <DropdownMenuShortcut>
                {keyboardShortcutText(
                  "workbench.surface.text.increase-letter-spacing"
                )}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                instance.surface.a11yChangeTextLetterSpacing("selection", -0.1)
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              Decrease letter spacing
              <DropdownMenuShortcut>
                {keyboardShortcutText(
                  "workbench.surface.text.decrease-letter-spacing"
                )}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {/* Case */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            Case
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40">
            <DropdownMenuItem
              onClick={() =>
                applyToTextNodes((node_id) =>
                  instance.commands.changeTextNodeTextTransform(node_id, "none")
                )
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              <LetterCaseToggleIcon className="size-3.5" />
              Original case
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                applyToTextNodes((node_id) =>
                  instance.commands.changeTextNodeTextTransform(
                    node_id,
                    "uppercase"
                  )
                )
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              <LetterCaseUppercaseIcon className="size-3.5" />
              Uppercase
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                applyToTextNodes((node_id) =>
                  instance.commands.changeTextNodeTextTransform(
                    node_id,
                    "lowercase"
                  )
                )
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              <LetterCaseLowercaseIcon className="size-3.5" />
              Lowercase
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function ArrangeMenuContent() {
  const instance = useCurrentEditor();
  const selection = useEditorState(instance, (state) => state.selection);
  const hasSelection = selection.length > 0;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="text-xs">
        Arrange
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-40">
        {/* Align */}
        <DropdownMenuItem
          onClick={() => instance.surface.a11yAlign({ horizontal: "min" })}
          disabled={!hasSelection}
          className="text-xs"
        >
          <AlignLeftIcon className="size-3.5" />
          Align left
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.arrange.align-left")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yAlign({ horizontal: "center" })}
          disabled={!hasSelection}
          className="text-xs"
        >
          <AlignCenterHorizontallyIcon className="size-3.5" />
          Align horizontal centers
          <DropdownMenuShortcut>
            {keyboardShortcutText(
              "workbench.surface.arrange.align-horizontal-center"
            )}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yAlign({ horizontal: "max" })}
          disabled={!hasSelection}
          className="text-xs"
        >
          <AlignRightIcon className="size-3.5" />
          Align right
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.arrange.align-right")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yAlign({ vertical: "min" })}
          disabled={!hasSelection}
          className="text-xs"
        >
          <AlignTopIcon className="size-3.5" />
          Align top
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.arrange.align-top")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yAlign({ vertical: "center" })}
          disabled={!hasSelection}
          className="text-xs"
        >
          <AlignCenterVerticallyIcon className="size-3.5" />
          Align vertical centers
          <DropdownMenuShortcut>
            {keyboardShortcutText(
              "workbench.surface.arrange.align-vertical-center"
            )}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yAlign({ vertical: "max" })}
          disabled={!hasSelection}
          className="text-xs"
        >
          <AlignBottomIcon className="size-3.5" />
          Align bottom
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.arrange.align-bottom")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Distribute */}
        <DropdownMenuItem
          onClick={() => instance.commands.distributeEvenly("selection", "x")}
          disabled={!hasSelection}
          className="text-xs"
        >
          <SpaceEvenlyHorizontallyIcon className="size-3.5" />
          Distribute horizontal spacing
          <DropdownMenuShortcut>
            {keyboardShortcutText(
              "workbench.surface.arrange.distribute-horizontally"
            )}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.commands.distributeEvenly("selection", "y")}
          disabled={!hasSelection}
          className="text-xs"
        >
          <SpaceEvenlyVerticallyIcon className="size-3.5" />
          Distribute vertical spacing
          <DropdownMenuShortcut>
            {keyboardShortcutText(
              "workbench.surface.arrange.distribute-vertically"
            )}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function ObjectMenuContent() {
  const instance = useCurrentEditor();
  const selection = useEditorState(instance, (state) => state.selection);
  const hasSelection = selection.length > 0;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="text-xs">
        Object
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-40">
        {/* Container & Grouping */}
        <DropdownMenuItem
          onClick={() => instance.commands.contain("selection")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Container selection
          <DropdownMenuShortcut>
            {keyboardShortcutText(
              "workbench.surface.object.group-with-container"
            )}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.commands.group("selection")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Group selection
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.object.group")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.ungroup(selection)}
          disabled={!hasSelection}
          className="text-xs"
        >
          Ungroup selection
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.object.ungroup")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Mask */}
        <DropdownMenuItem
          onClick={() => instance.commands.groupMask(selection)}
          disabled={!hasSelection}
          className="text-xs"
        >
          Use as mask
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Layout */}
        <DropdownMenuItem
          onClick={() => instance.commands.autoLayout("selection")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Add layout
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.object.auto-layout")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        {/* Create arc - disabled */}
        {/* TODO: Implement Create arc */}
        <DropdownMenuItem disabled className="text-xs">
          Create arc
        </DropdownMenuItem>
        {/* More layout options */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            More layout options
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40">
            {/* TODO: Implement Suggest layout */}
            {/* <DropdownMenuItem disabled className="text-xs">
              Suggest layout
              <DropdownMenuShortcut>
                {keyboardShortcutText(
                  "workbench.surface.object.auto-layout-all"
                )}
              </DropdownMenuShortcut>
            </DropdownMenuItem> */}
            {/* TODO: Implement Remove all layout */}
            <DropdownMenuItem disabled className="text-xs">
              Remove all layout
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Lock aspect ratio */}
            <DropdownMenuItem
              onClick={() => instance.surface.a11yLockAspectRatio("selection")}
              disabled={!hasSelection}
              className="text-xs"
            >
              Lock aspect ratio
            </DropdownMenuItem>
            {/* Unlock aspect ratio */}
            <DropdownMenuItem
              onClick={() =>
                instance.surface.a11yUnlockAspectRatio("selection")
              }
              disabled={!hasSelection}
              className="text-xs"
            >
              Unlock aspect ratio
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* TODO: Implement Resize to fit */}
            {/* <DropdownMenuItem disabled className="text-xs">
              Resize to fit
              <DropdownMenuShortcut>
                {keyboardShortcutText("workbench.surface.object.resize-to-fit")}
              </DropdownMenuShortcut>
            </DropdownMenuItem> */}
            {/* TODO: Implement Set width to hug contents */}
            <DropdownMenuItem disabled className="text-xs">
              Set width to hug contents
            </DropdownMenuItem>
            {/* TODO: Implement Set height to hug contents */}
            <DropdownMenuItem disabled className="text-xs">
              Set height to hug contents
            </DropdownMenuItem>
            {/* TODO: Implement Set width to fill container */}
            <DropdownMenuItem disabled className="text-xs">
              Set width to fill container
            </DropdownMenuItem>
            {/* TODO: Implement Set height to fill container */}
            <DropdownMenuItem disabled className="text-xs">
              Set height to fill container
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        {/* Ordering */}
        <DropdownMenuItem
          onClick={() => instance.surface.order("front")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Bring to front
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.view.move-to-front")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.order("forward")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Bring forward
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.view.move-forward")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.order("backward")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Send backward
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.view.move-backward")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.order("back")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Send to back
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.view.move-to-back")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Transform - Flip & Rotate disabled */}
        {/* TODO: Implement Flip horizontal */}
        <DropdownMenuItem disabled className="text-xs">
          Flip horizontal
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.object.flip-horizontal")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        {/* TODO: Implement Flip vertical */}
        <DropdownMenuItem disabled className="text-xs">
          Flip vertical
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.object.flip-vertical")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        {/* TODO: Implement Rotate 180° */}
        <DropdownMenuItem disabled className="text-xs">
          Rotate 180°
        </DropdownMenuItem>
        {/* TODO: Implement Rotate 90° left */}
        <DropdownMenuItem disabled className="text-xs">
          Rotate 90° left
        </DropdownMenuItem>
        {/* TODO: Implement Rotate 90° right */}
        <DropdownMenuItem disabled className="text-xs">
          Rotate 90° right
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Flatten */}
        <DropdownMenuItem
          onClick={() => instance.commands.flatten("selection")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Flatten
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.object.flatten")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        {/* Outline stroke - disabled */}
        {/* TODO: Implement Outline stroke */}
        <DropdownMenuItem disabled className="text-xs">
          Outline stroke
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.object.outline-stroke")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Boolean groups */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            Boolean groups
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40">
            <DropdownMenuItem
              onClick={() => instance.commands.union(selection)}
              disabled={!hasSelection}
              className="text-xs"
            >
              Union
              <DropdownMenuShortcut>
                {keyboardShortcutText("workbench.surface.object.boolean-union")}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => instance.commands.subtract(selection)}
              disabled={!hasSelection}
              className="text-xs"
            >
              Subtract
              <DropdownMenuShortcut>
                {keyboardShortcutText(
                  "workbench.surface.object.boolean-subtract"
                )}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => instance.commands.intersect(selection)}
              disabled={!hasSelection}
              className="text-xs"
            >
              Intersect
              <DropdownMenuShortcut>
                {keyboardShortcutText(
                  "workbench.surface.object.boolean-intersect"
                )}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => instance.commands.exclude(selection)}
              disabled={!hasSelection}
              className="text-xs"
            >
              Exclude
              <DropdownMenuShortcut>
                {keyboardShortcutText(
                  "workbench.surface.object.boolean-exclude"
                )}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        {/* Rasterize - disabled */}
        {/* TODO: Implement Rasterize selection */}
        <DropdownMenuItem disabled className="text-xs">
          Rasterize selection
        </DropdownMenuItem>
        {/* Visibility & Lock */}
        <DropdownMenuItem
          onClick={() => instance.surface.a11yToggleActive("selection")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Show/Hide selection
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.object.toggle-active")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yToggleLocked("selection")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Lock/Unlock selection
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.object.toggle-locked")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        {/* Hide other layers - disabled */}
        {/* TODO: Implement Hide other layers */}
        <DropdownMenuItem disabled className="text-xs">
          Hide other layers
        </DropdownMenuItem>
        {/* Collapse layers - disabled */}
        {/* TODO: Implement Collapse layers */}
        {/* <DropdownMenuItem disabled className="text-xs">
          Collapse layers
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.ui.collapse-layers")}
          </DropdownMenuShortcut>
        </DropdownMenuItem> */}
        <DropdownMenuSeparator />
        {/* Fill & Stroke */}
        <DropdownMenuItem
          onClick={() => instance.surface.a11yClearFill("selection")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Remove fill
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.object.remove-fill")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yClearStroke("selection")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Remove stroke
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.object.remove-stroke")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11ySwapFillAndStroke("selection")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Swap fill and stroke
          <DropdownMenuShortcut>
            {keyboardShortcutText(
              "workbench.surface.object.swap-fill-and-stroke"
            )}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

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
import { useInsertFile } from "@/grida-canvas-react/use-data-transfer";
import { io } from "@grida/io";
import { useFilePicker } from "use-file-picker";
import { ImageIcon } from "lucide-react";
import { SlackLogoIcon } from "@/components/logos";
import { distro } from "../distro";

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
  const { openFilePicker, plainFiles } = useFilePicker({
    accept: "image/png,image/jpeg,image/webp,image/svg+xml",
    multiple: true,
  });

  // Get editor state for View menu
  const ruler = useEditorState(instance, (state) => state.ruler);
  const pixelgrid = useEditorState(instance, (state) => state.pixelgrid);

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
        onImport={(res) => {
          instance.insert({
            document: iofigma.restful.factory.document(
              res.document as any,
              res.images,
              {
                gradient_id_generator: () => v4(),
              }
            ),
          });
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
            instance.doc.createScene({ id: sceneId, name: page.name });

            if (page.rootNodes.length > 0) {
              const packedDoc = FigImporter.convertPageToScene(page, {
                gradient_id_generator: () => v4(),
              });
              instance.insert({ document: packedDoc });
            }
          }
        }}
      />

      <SettingsDialog
        {...settingsDialog.props}
        initialPage={settingsInitialPage}
      />

      <DropdownMenuContent align="start" className="min-w-52">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            File
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40">
            <DropdownMenuItem
              onClick={importFromJson.openDialog}
              className="text-xs"
            >
              <FileIcon className="size-3.5" />
              Open .grida
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExport} className="text-xs">
              <DownloadIcon className="size-3.5" />
              Save as .grida
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleImportImageClick}
              className="text-xs"
            >
              <ImageIcon className="size-3.5" />
              Import Image
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={importFromFigmaDialog.openDialog}
              className="text-xs"
            >
              <FigmaLogoIcon className="size-3.5" />
              Import Figma
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            Edit
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40">
            {/* History Section */}
            <DropdownMenuItem
              onClick={() => instance.commands.undo()}
              className="text-xs"
            >
              Undo
              <DropdownMenuShortcut>⌘Z</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => instance.commands.redo()}
              className="text-xs"
            >
              Redo
              <DropdownMenuShortcut>⌘⇧Z</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Clipboard Section */}
            <DropdownMenuItem
              onClick={() => instance.surface.a11yCut()}
              disabled={!hasSelection}
              className="text-xs"
            >
              Cut
              <DropdownMenuShortcut>⌘X</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => instance.surface.a11yCopy()}
              disabled={!hasSelection}
              className="text-xs"
            >
              Copy
              <DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
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
              <DropdownMenuShortcut>⇧⌘C</DropdownMenuShortcut>
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
            {/* Actions Section */}
            <DropdownMenuItem
              onClick={() => instance.commands.duplicate("selection")}
              disabled={!hasSelection}
              className="text-xs"
            >
              Duplicate
              <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => instance.surface.a11yDelete()}
              disabled={!hasSelection}
              className="text-xs"
            >
              Delete
              <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            View
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40">
            {/* Zoom Controls */}
            <DropdownMenuCheckboxItem
              checked={false}
              onSelect={() => instance.camera.zoomIn()}
              className="text-xs"
            >
              Zoom in
              <DropdownMenuShortcut>⌘+</DropdownMenuShortcut>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={false}
              onSelect={() => instance.camera.zoomOut()}
              className="text-xs"
            >
              Zoom out
              <DropdownMenuShortcut>⌘-</DropdownMenuShortcut>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={false}
              onSelect={() => instance.camera.scale(1, "center")}
              className="text-xs"
            >
              Zoom to 100%
              <DropdownMenuShortcut>⌘0</DropdownMenuShortcut>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={false}
              onSelect={() => instance.camera.fit("*")}
              className="text-xs"
            >
              Zoom to fit
              <DropdownMenuShortcut>⇧1</DropdownMenuShortcut>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={false}
              onSelect={() => instance.camera.fit("selection")}
              className="text-xs"
            >
              Zoom to selection
              <DropdownMenuShortcut>⇧2</DropdownMenuShortcut>
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {/* Display Options */}
            <DropdownMenuCheckboxItem
              checked={pixelgrid === "on"}
              onSelect={() => {
                instance.surface.surfaceTogglePixelGrid();
              }}
              className="text-xs"
            >
              Pixel grid
              <DropdownMenuShortcut>⇧'</DropdownMenuShortcut>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={ruler === "on"}
              onSelect={() => {
                instance.surface.surfaceToggleRuler();
              }}
              className="text-xs"
            >
              Ruler
              <DropdownMenuShortcut>⇧R</DropdownMenuShortcut>
            </DropdownMenuCheckboxItem>
            {/* UI Visibility */}
            {toggleVisibility && toggleMinimal && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={toggleVisibility}
                  className="text-xs"
                >
                  Show/Hide UI
                  <DropdownMenuShortcut>⌘\</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggleMinimal} className="text-xs">
                  Minimize UI
                  <DropdownMenuShortcut>⇧⌘\</DropdownMenuShortcut>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            Settings
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40">
            <DropdownMenuItem
              onClick={() => {
                setSettingsInitialPage("general");
                settingsDialog.openDialog();
              }}
              className="text-xs"
            >
              General
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setSettingsInitialPage("keybindings");
                settingsDialog.openDialog();
              }}
              className="text-xs"
            >
              Keyboard shortcuts
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
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

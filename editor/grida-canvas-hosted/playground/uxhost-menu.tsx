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
import {
  useInsertFile,
  useDataTransferEventTarget,
} from "@/grida-canvas-react/use-data-transfer";
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
  const { onpaste_external_event } = useDataTransferEventTarget();
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
          instance.surface.insert({
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
            instance.surface.surfaceCreateScene({
              id: sceneId,
              name: page.name,
            });

            if (page.rootNodes.length > 0) {
              const packedDoc = FigImporter.convertPageToScene(page, {
                gradient_id_generator: () => v4(),
              });
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
        <DropdownMenuItem onClick={onPaste} className="text-xs">
          Paste
          <DropdownMenuShortcut>⌘V</DropdownMenuShortcut>
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
  );
}

function ViewMenuContent({
  pixelgrid,
  ruler,
  toggleVisibility,
  toggleMinimal,
}: {
  pixelgrid: string;
  ruler: string;
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
          <DropdownMenuShortcut>⇧0</DropdownMenuShortcut>
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
            <DropdownMenuItem onClick={toggleVisibility} className="text-xs">
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
    (node_id) => instance.doc.getNodeSnapshotById(node_id)?.type === "text"
  );

  // Helper to apply command to all selected text nodes
  const applyToTextNodes = (fn: (node_id: string) => void) => {
    selection.forEach((node_id) => {
      const node = instance.doc.getNodeSnapshotById(node_id);
      if (node?.type === "text") {
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
          <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yToggleItalic("selection")}
          disabled={!hasTextSelection}
          className="text-xs"
        >
          <FontItalicIcon className="size-3.5" />
          Italic
          <DropdownMenuShortcut>⌘I</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yToggleUnderline("selection")}
          disabled={!hasTextSelection}
          className="text-xs"
        >
          <UnderlineIcon className="size-3.5" />
          Underline
          <DropdownMenuShortcut>⌘U</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yToggleLineThrough("selection")}
          disabled={!hasTextSelection}
          className="text-xs"
        >
          <StrikethroughIcon className="size-3.5" />
          Strikethrough
          <DropdownMenuShortcut>⇧⌘X</DropdownMenuShortcut>
        </DropdownMenuItem>
        {/* Create link - disabled */}
        {/* TODO: Implement Create link */}
        <DropdownMenuItem disabled className="text-xs">
          Create link
          <DropdownMenuShortcut>⇧⌘U</DropdownMenuShortcut>
        </DropdownMenuItem>
        {/* Lists - disabled */}
        {/* TODO: Implement Bulleted list */}
        <DropdownMenuItem disabled className="text-xs">
          Bulleted list
          <DropdownMenuShortcut>⇧⌘8</DropdownMenuShortcut>
        </DropdownMenuItem>
        {/* TODO: Implement Numbered list */}
        <DropdownMenuItem disabled className="text-xs">
          Numbered list
          <DropdownMenuShortcut>⇧⌘7</DropdownMenuShortcut>
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
              <DropdownMenuShortcut>⌥⌘L</DropdownMenuShortcut>
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
              <DropdownMenuShortcut>⌥⌘T</DropdownMenuShortcut>
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
              <DropdownMenuShortcut>⌥⌘R</DropdownMenuShortcut>
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
              <DropdownMenuShortcut>⌥⌘J</DropdownMenuShortcut>
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
              <DropdownMenuShortcut>Tab</DropdownMenuShortcut>
            </DropdownMenuItem>
            {/* TODO: Implement Decrease indentation */}
            <DropdownMenuItem disabled className="text-xs">
              Decrease indentation
              <DropdownMenuShortcut>⇧Tab</DropdownMenuShortcut>
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
              <DropdownMenuShortcut>⇧⌘&gt;</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                instance.surface.a11yChangeTextFontSize("selection", -1)
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              Decrease font size
              <DropdownMenuShortcut>⇧⌘&lt;</DropdownMenuShortcut>
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
              <DropdownMenuShortcut>⌥⌘&gt;</DropdownMenuShortcut>
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
              <DropdownMenuShortcut>⌥⌘&lt;</DropdownMenuShortcut>
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
              <DropdownMenuShortcut>⌥⇧&gt;</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                instance.surface.a11yChangeTextLineHeight("selection", -1)
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              Decrease line height
              <DropdownMenuShortcut>⌥⇧&lt;</DropdownMenuShortcut>
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
              <DropdownMenuShortcut>⌥&gt;</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                instance.surface.a11yChangeTextLetterSpacing("selection", -0.1)
              }
              disabled={!hasTextSelection}
              className="text-xs"
            >
              Decrease letter spacing
              <DropdownMenuShortcut>⌥&lt;</DropdownMenuShortcut>
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
          <DropdownMenuShortcut>⌥A</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yAlign({ horizontal: "center" })}
          disabled={!hasSelection}
          className="text-xs"
        >
          <AlignCenterHorizontallyIcon className="size-3.5" />
          Align horizontal centers
          <DropdownMenuShortcut>⌥H</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yAlign({ horizontal: "max" })}
          disabled={!hasSelection}
          className="text-xs"
        >
          <AlignRightIcon className="size-3.5" />
          Align right
          <DropdownMenuShortcut>⌥D</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yAlign({ vertical: "min" })}
          disabled={!hasSelection}
          className="text-xs"
        >
          <AlignTopIcon className="size-3.5" />
          Align top
          <DropdownMenuShortcut>⌥W</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yAlign({ vertical: "center" })}
          disabled={!hasSelection}
          className="text-xs"
        >
          <AlignCenterVerticallyIcon className="size-3.5" />
          Align vertical centers
          <DropdownMenuShortcut>⌥V</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yAlign({ vertical: "max" })}
          disabled={!hasSelection}
          className="text-xs"
        >
          <AlignBottomIcon className="size-3.5" />
          Align bottom
          <DropdownMenuShortcut>⌥S</DropdownMenuShortcut>
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
          <DropdownMenuShortcut>⌥⌃V</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.commands.distributeEvenly("selection", "y")}
          disabled={!hasSelection}
          className="text-xs"
        >
          <SpaceEvenlyVerticallyIcon className="size-3.5" />
          Distribute vertical spacing
          <DropdownMenuShortcut>⌥⌃H</DropdownMenuShortcut>
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
          <DropdownMenuShortcut>⌥⌘G</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.commands.group("selection")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Group selection
          <DropdownMenuShortcut>⌘G</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.ungroup(selection)}
          disabled={!hasSelection}
          className="text-xs"
        >
          Ungroup selection
          <DropdownMenuShortcut>⇧⌘G</DropdownMenuShortcut>
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
          <DropdownMenuShortcut>⇧A</DropdownMenuShortcut>
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
            <DropdownMenuItem disabled className="text-xs">
              Suggest layout
              <DropdownMenuShortcut>⇧⌃A</DropdownMenuShortcut>
            </DropdownMenuItem>
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
            <DropdownMenuItem disabled className="text-xs">
              Resize to fit
              <DropdownMenuShortcut>⌥⇧⌘R</DropdownMenuShortcut>
            </DropdownMenuItem>
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
          <DropdownMenuShortcut>]</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.order("forward")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Bring forward
          <DropdownMenuShortcut>⌘]</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.order("backward")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Send backward
          <DropdownMenuShortcut>⌘[</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.order("back")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Send to back
          <DropdownMenuShortcut>[</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Transform - Flip & Rotate disabled */}
        {/* TODO: Implement Flip horizontal */}
        <DropdownMenuItem disabled className="text-xs">
          Flip horizontal
          <DropdownMenuShortcut>⇧H</DropdownMenuShortcut>
        </DropdownMenuItem>
        {/* TODO: Implement Flip vertical */}
        <DropdownMenuItem disabled className="text-xs">
          Flip vertical
          <DropdownMenuShortcut>⇧V</DropdownMenuShortcut>
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
          <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
        </DropdownMenuItem>
        {/* Outline stroke - disabled */}
        {/* TODO: Implement Outline stroke */}
        <DropdownMenuItem disabled className="text-xs">
          Outline stroke
          <DropdownMenuShortcut>⌥⌘O</DropdownMenuShortcut>
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
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => instance.commands.subtract(selection)}
              disabled={!hasSelection}
              className="text-xs"
            >
              Subtract
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => instance.commands.intersect(selection)}
              disabled={!hasSelection}
              className="text-xs"
            >
              Intersect
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => instance.commands.exclude(selection)}
              disabled={!hasSelection}
              className="text-xs"
            >
              Exclude
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
          <DropdownMenuShortcut>⇧⌘H</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yToggleLocked("selection")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Lock/Unlock selection
          <DropdownMenuShortcut>⇧⌘L</DropdownMenuShortcut>
        </DropdownMenuItem>
        {/* Hide other layers - disabled */}
        {/* TODO: Implement Hide other layers */}
        <DropdownMenuItem disabled className="text-xs">
          Hide other layers
        </DropdownMenuItem>
        {/* Collapse layers - disabled */}
        {/* TODO: Implement Collapse layers */}
        <DropdownMenuItem disabled className="text-xs">
          Collapse layers
          <DropdownMenuShortcut>⌥L</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Fill & Stroke */}
        <DropdownMenuItem
          onClick={() => instance.surface.a11yClearFill("selection")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Remove fill
          <DropdownMenuShortcut>⌥/</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11yClearStroke("selection")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Remove stroke
          <DropdownMenuShortcut>⇧/</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => instance.surface.a11ySwapFillAndStroke("selection")}
          disabled={!hasSelection}
          className="text-xs"
        >
          Swap fill and stroke
          <DropdownMenuShortcut>⇧X</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

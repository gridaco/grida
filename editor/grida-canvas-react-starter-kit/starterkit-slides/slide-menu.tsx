"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useEditorState, useCurrentEditor } from "@/grida-canvas-react";
import { useBackendState } from "@/grida-canvas-react/provider";
import {
  useSlideEditorMode,
  useSlides,
  useCurrentSlide,
} from "@/grida-canvas-react/use-slide-editor";
import {
  DownloadIcon,
  FigmaLogoIcon,
  FileIcon,
  GitHubLogoIcon,
} from "@radix-ui/react-icons";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { SlideExportDialog } from "./slide-export-dialog";
import { saveAs } from "file-saver";
import Link from "next/link";
import {
  ImportFromFigmaSlidesDialog,
  ImportFromGridaDialog,
} from "@/grida-canvas-react-starter-kit/starterkit-import";
import { sitemap } from "@/www/data/sitemap";
import { deckBytesToSlidesDocument } from "@grida/io-figma";
import { editor } from "@/grida-canvas";
import { SettingsDialog } from "@/grida-canvas-hosted/playground/uxhost-settings";
import {
  useInsertFile,
  useDataTransferEventTarget,
} from "@/grida-canvas-react/use-data-transfer";
import { io } from "@grida/io";
import { useFilePicker } from "use-file-picker";
import { toast } from "sonner";
import { ImageIcon, FileDown } from "lucide-react";
import { SlackLogoIcon } from "@/components/logos";
import { distro } from "@/grida-canvas-hosted/distro";

// Shared menu sections — reused from the playground menu
import {
  EditMenuContent,
  ViewMenuContent,
  ObjectMenuContent,
  TextMenuContent,
  ArrangeMenuContent,
  SettingsMenuContent,
  PreferencesMenuContent,
  DevelopersMenuContent,
} from "@/grida-canvas-hosted/playground/uxhost-menu";

// ---------------------------------------------------------------------------
// Slide-specific menu content
// ---------------------------------------------------------------------------

/**
 * Slides-specific dropdown menu content.
 *
 * Composes shared editor menu sections (Edit, View, Object, Text, Arrange,
 * Settings, Preferences, Developers) with a slides-specific File section
 * that includes a slide export dialog.
 *
 * This replaces `PlaygroundMenuContent` in the slides page.
 */
export function SlideMenuContent() {
  const instance = useCurrentEditor();
  const mode = useSlideEditorMode();
  const slides = useSlides(mode);
  const currentSlide = useCurrentSlide(mode);

  // -- Dialog state --
  const importFromGrida = useDialogState("import-from-grida", {
    refreshkey: true,
  });
  const importFigmaSlides = useDialogState("import-figma-slides");
  const exportSlidesDialog = useDialogState("export-slides");
  const settingsDialog = useDialogState("settings");
  const [settingsInitialPage, setSettingsInitialPage] = useState<
    "keybindings" | "general"
  >("keybindings");

  // -- Image import --
  const { insertFromFile } = useInsertFile();
  const { openFilePicker, plainFiles } = useFilePicker({
    accept: "image/png,image/jpeg,image/webp,image/svg+xml",
    multiple: true,
  });

  useEffect(() => {
    if (plainFiles.length === 0) return;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    for (const file of plainFiles) {
      const [valid, type] = io.clipboard.filetype(file);
      if (valid) {
        insertFromFile(type, file, { clientX: centerX, clientY: centerY });
      } else {
        toast.error(`File type '${type}' is not supported`);
      }
    }
  }, [plainFiles, insertFromFile]);

  // -- Editor state for shared sections --
  const ruler = useEditorState(instance, (state) => state.ruler);
  const pixelgrid = useEditorState(instance, (state) => state.pixelgrid);
  const canvas_ui_container_label = useEditorState(
    instance,
    (state) => state.canvas_ui.container_label
  );
  const outline_mode = useEditorState(instance, (state) => state.outline_mode);
  const outline_mode_ignores_clips = useEditorState(
    instance,
    (state) => state.outline_mode_ignores_clips
  );
  const pixelpreview = useEditorState(instance, (state) => state.pixelpreview);
  const selection = useEditorState(instance, (state) => state.selection);
  const backend = useBackendState();
  const hasSelection = selection.length > 0;
  const { onpaste_external_event } = useDataTransferEventTarget();

  // -- Callbacks --
  const onExport = () => {
    const blob = instance.archive();
    saveAs(blob, distro.snapshot_file_name());
  };

  return (
    <>
      {/* Dialogs */}
      <ImportFromGridaDialog
        key={importFromGrida.refreshkey}
        {...importFromGrida.props}
        onImport={(file) => {
          if (
            file.assets?.images &&
            Object.keys(file.assets.images).length > 0
          ) {
            instance.loadImages(file.assets.images);
          }
          mode.resetDocument(
            editor.state.init({ editable: true, document: file.document }),
            Date.now() + ""
          );
        }}
      />
      <ImportFromFigmaSlidesDialog
        {...importFigmaSlides.props}
        onImportFig={async (result) => {
          const buffer = await result.file.arrayBuffer();
          const { document, assets } = deckBytesToSlidesDocument(
            new Uint8Array(buffer)
          );
          if (assets && Object.keys(assets).length > 0) {
            instance.loadImages(assets);
          }
          mode.resetDocument(
            editor.state.init({ editable: true, document }),
            Date.now() + ""
          );
        }}
      />
      <SettingsDialog
        {...settingsDialog.props}
        initialPage={settingsInitialPage}
      />
      <SlideExportDialog
        {...exportSlidesDialog.props}
        onExport={async (options) => {
          // Resolve which slides to export
          const targetSlides =
            options.content === "all"
              ? slides
              : currentSlide
                ? [currentSlide]
                : [];

          if (targetSlides.length === 0) {
            toast.error("No slides to export");
            return;
          }

          const slideIds = targetSlides.map((s) => s.id);
          const pageSize = {
            width: mode.config.slideWidth,
            height: mode.config.slideHeight,
          };

          try {
            if (options.fileType === "pdf") {
              const pdfBytes = await instance.exportPdfDocument(slideIds, {
                pageSize,
              });
              saveAs(
                new Blob([pdfBytes as BlobPart], { type: "application/pdf" }),
                "slides.pdf"
              );
            } else {
              // PNG / SVG: export each slide individually and download
              // (single file for 1 slide, zip for multiple)
              const format = options.fileType === "png" ? "PNG" : "SVG";
              if (slideIds.length === 1) {
                const data = await instance.exportNodeAs(slideIds[0], format, {
                  format,
                  ...(format !== "SVG"
                    ? {
                        constraints: { type: "scale" as const, value: 1 },
                      }
                    : {}),
                } as any);
                const ext = format.toLowerCase();
                const mime = format === "PNG" ? "image/png" : "image/svg+xml";
                const blob = new Blob([data as BlobPart], { type: mime });
                saveAs(blob, `slide.${ext}`);
              } else {
                // Multiple slides → zip
                const files: Record<string, Uint8Array> = {};
                for (let i = 0; i < slideIds.length; i++) {
                  const data = await instance.exportNodeAs(
                    slideIds[i],
                    format,
                    {
                      format,
                      ...(format !== "SVG"
                        ? {
                            constraints: { type: "scale" as const, value: 1 },
                          }
                        : {}),
                    } as any
                  );
                  const ext = format.toLowerCase();
                  const bytes =
                    typeof data === "string"
                      ? new TextEncoder().encode(data)
                      : data;
                  files[`slide-${i + 1}.${ext}`] =
                    io.zip.ensureUint8Array(bytes);
                }
                const zipData = io.zip.create(files);
                saveAs(
                  new Blob([zipData as BlobPart], { type: "application/zip" }),
                  "slides.zip"
                );
              }
            }
          } catch (err) {
            console.error("Slide export failed:", err);
            toast.error("Export failed. See console for details.");
          }

          exportSlidesDialog.closeDialog();
        }}
      />

      <DropdownMenuContent align="start" className="min-w-52">
        {/* ---- Slide-specific File section ---- */}
        <SlideFileMenuSection
          onExport={onExport}
          onImportGrida={importFromGrida.openDialog}
          onImportImage={() => openFilePicker()}
          onImportFigmaSlides={importFigmaSlides.openDialog}
          onExportSlides={exportSlidesDialog.openDialog}
        />

        {/* ---- Shared sections ---- */}
        <EditMenuContent
          hasSelection={hasSelection}
          backend={backend}
          onPaste={onpaste_external_event}
        />
        <ViewMenuContent
          pixelgrid={pixelgrid}
          ruler={ruler}
          canvas_ui_container_label={canvas_ui_container_label}
          outline_mode={outline_mode}
          outline_mode_ignores_clips={outline_mode_ignores_clips}
          pixelpreview={pixelpreview}
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

// ---------------------------------------------------------------------------
// Slide-specific File menu section
// ---------------------------------------------------------------------------

function SlideFileMenuSection({
  onExport,
  onImportGrida,
  onImportImage,
  onImportFigmaSlides,
  onExportSlides,
}: {
  onExport: () => void;
  onImportGrida: () => void;
  onImportImage: () => void;
  onImportFigmaSlides: () => void;
  onExportSlides: () => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="text-xs">File</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-40">
        <DropdownMenuItem onClick={onImportGrida} className="text-xs">
          <FileIcon className="size-3.5" />
          Open .grida
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExport} className="text-xs">
          <DownloadIcon className="size-3.5" />
          Save as .grida
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onImportImage} className="text-xs">
          <ImageIcon className="size-3.5" />
          Import Image
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onImportFigmaSlides} className="text-xs">
          <FigmaLogoIcon className="size-3.5" />
          Import Figma .deck
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onExportSlides} className="text-xs">
          <FileDown className="size-3.5" />
          Export slides to…
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

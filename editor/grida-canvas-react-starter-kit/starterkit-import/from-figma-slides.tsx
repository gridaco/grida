import React from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { FigmaLogoIcon } from "@radix-ui/react-icons";
import { FileDropzone } from "./file-dropzone";
import {
  useFigFileImport,
  type FigFileImportResult,
} from "./use-fig-file-import";
import { ConfirmFigImportCard } from "./confirm-fig-import-card";

const validateDeckFile = (file: File) =>
  file.name.toLowerCase().endsWith(".deck");

/**
 * Import dialog for Figma Slides (`.deck`) files.
 *
 * Unlike the Figma Design importer, this has no API tab — Figma Slides
 * cannot be accessed via the Figma REST API, so file upload is the only
 * supported transport.
 */
export function ImportFromFigmaSlidesDialog({
  onImportFig,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  onImportFig?: (result: FigFileImportResult) => Promise<void>;
}) {
  const close = () => props.onOpenChange?.(false);
  const fig = useFigFileImport(onImportFig);

  return (
    <Dialog {...props}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FigmaLogoIcon className="size-5" />
            Import from Figma Slides
          </DialogTitle>
          <DialogDescription>
            Import a Figma Slides deck into your Grida document
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {fig.step === "select" && (
            <>
              <div>
                <Label className="text-sm">Select a .deck file</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Import Figma Slides pages as Grida scenes.
                </p>
              </div>

              <FileDropzone
                accept=".deck"
                onFileSelected={fig.setSelectedFile}
                buttonText="Select .deck File or Drag & Drop"
                loadingText="Processing..."
                dragText="Drop .deck file here"
                errorMessage="Please drop a .deck file"
                validateFile={validateDeckFile}
                disabled={fig.parsing}
              />

              {fig.selectedFile && (
                <div className="space-y-2">
                  <p className="text-sm">
                    <strong>Selected:</strong> {fig.selectedFile.name}
                  </p>
                  {fig.parsing && (
                    <Progress value={fig.progress} className="w-full" />
                  )}
                </div>
              )}
            </>
          )}

          {fig.step === "confirm" && fig.parsed && (
            <>
              <div>
                <Label className="text-sm">Confirm Import</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Review the scenes that will be imported from{" "}
                  <strong>{fig.selectedFile?.name}</strong>
                </p>
              </div>

              <ConfirmFigImportCard parsed={fig.parsed} />
            </>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          {fig.step === "confirm" && (
            <Button onClick={() => fig.runImport(close)}>Import</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

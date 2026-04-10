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
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { FigmaLogoIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import { FileIcon, CheckCircle2Icon } from "lucide-react";
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

        <Alert>
          <InfoCircledIcon />
          <AlertTitle>File Upload Only</AlertTitle>
          <AlertDescription>
            <p>
              Figma Slides (<code>.deck</code>) cannot be accessed via the Figma
              REST API. To import, save the deck locally from Figma first (File
              &rarr; Save local copy), then upload the <code>.deck</code> file
              here.
            </p>
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          {fig.step === "select" && (
            <>
              <FileDropzone
                accept=".deck"
                onFileSelected={fig.setSelectedFile}
                buttonText="Click to browse or drag & drop"
                description="Accepts .deck files from Figma Slides"
                loadingText="Parsing deck..."
                dragText="Drop .deck file here"
                errorMessage="Please drop a .deck file"
                validateFile={validateDeckFile}
                disabled={fig.parsing}
              />

              {fig.selectedFile && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
                    <FileIcon className="size-4 text-muted-foreground shrink-0" />
                    <span className="truncate font-medium">
                      {fig.selectedFile.name}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto shrink-0">
                      {(fig.selectedFile.size / 1024).toFixed(0)} KB
                    </span>
                  </div>
                  {fig.parsing && (
                    <div className="space-y-1">
                      <Progress value={fig.progress} className="w-full h-1.5" />
                      <p className="text-xs text-muted-foreground">
                        Parsing slides... {fig.progress}%
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {fig.step === "confirm" && fig.parsed && (
            <>
              <div className="flex items-center gap-2">
                <CheckCircle2Icon className="size-4 text-emerald-500 shrink-0" />
                <p className="text-sm">
                  Ready to import from <strong>{fig.selectedFile?.name}</strong>
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
            <Button onClick={() => fig.runImport(close)}>
              Import {fig.parsed?.sceneCount} Scene
              {fig.parsed?.sceneCount !== 1 ? "s" : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

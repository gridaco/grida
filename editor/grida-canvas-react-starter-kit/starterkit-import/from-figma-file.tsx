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
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  ExternalLinkIcon,
  FigmaLogoIcon,
  InfoCircledIcon,
} from "@radix-ui/react-icons";
import Link from "next/link";
import { Kbd } from "@/components/ui/kbd";
import { FileDropzone } from "./file-dropzone";
import {
  useFigFileImport,
  type FigFileImportResult,
} from "./use-fig-file-import";
import { ConfirmFigImportCard } from "./confirm-fig-import-card";

const validateFigFile = (file: File) => {
  const name = file.name.toLowerCase();
  return name.endsWith(".fig") || name.endsWith(".deck");
};

/**
 * Import dialog for Figma Design (`.fig`) files.
 *
 * Accepts `.fig` or `.deck` at the dropzone level (the underlying parser
 * handles both), but the copy surface is oriented around Figma Design.
 */
export function ImportFromFigmaFileDialog({
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
            Import from Figma (.fig)
          </DialogTitle>
          <DialogDescription>
            Import Figma pages as Grida scenes
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <InfoCircledIcon />
          <AlertTitle>
            Quick Tip - You can use <Kbd>⌘C</Kbd> <Kbd>⌘V</Kbd>{" "}
          </AlertTitle>
          <AlertDescription>
            <p>
              You can also simply copy content in Figma <Kbd>⌘C</Kbd> and paste
              it directly into Grida <Kbd>⌘V</Kbd>. No file or API needed!{" "}
            </p>
            <Link
              href="/docs/editor/features/copy-paste-figma"
              target="_blank"
              className="inline-flex items-center gap-1 underline hover:opacity-70"
            >
              Learn More
              <ExternalLinkIcon className="size-3" />
            </Link>
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          {fig.step === "select" && (
            <>
              <div>
                <Label className="text-sm">Select a .fig file</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Import Figma pages as Grida scenes.{" "}
                  <Link
                    href="/docs/with-figma/guides/how-to-get-fig-file"
                    target="_blank"
                    className="inline-flex items-center gap-1 underline hover:opacity-70"
                  >
                    How to get a .fig file
                    <ExternalLinkIcon className="size-3" />
                  </Link>
                </p>
              </div>

              <FileDropzone
                accept=".fig,.deck"
                onFileSelected={fig.setSelectedFile}
                buttonText="Select .fig File or Drag & Drop"
                loadingText="Processing..."
                dragText="Drop .fig file here"
                errorMessage="Please drop a .fig file"
                validateFile={validateFigFile}
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

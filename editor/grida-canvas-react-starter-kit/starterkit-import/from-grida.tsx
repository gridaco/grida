import React, { useState } from "react";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import { io } from "@grida/io";
import { FileDropzone } from "./file-dropzone";

const ACCEPTED_EXTENSIONS = [".grida", ".grida1"] as const;
const ACCEPT = ACCEPTED_EXTENSIONS.join(",");

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function ImportFromGridaDialog({
  onImport,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  onImport?: (document: io.LoadedDocument) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileImport = async () => {
    if (!selectedFile) {
      toast.error("No file selected.");
      return;
    }
    try {
      const doc = await io.load(selectedFile);
      onImport?.(doc);
      toast.success("File successfully imported!");
      props.onOpenChange?.(false);
      setSelectedFile(null);
    } catch (error) {
      toast.error("Failed to parse the file. Please check the format.");
      console.error(error);
    }
  };

  return (
    <Dialog {...props}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open .grida</DialogTitle>
          <DialogDescription>
            Import a document from a <code>.grida</code> or <code>.grida1</code>{" "}
            file.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Label>Select a file</Label>
          <FileDropzone
            accept={ACCEPT}
            onFileSelected={setSelectedFile}
            buttonText="Select File or Drag & Drop"
            dragText="Drop file here"
            errorMessage={`Please drop a ${ACCEPTED_EXTENSIONS.join(" or ")} file`}
            validateFile={isAcceptedFile}
          />
          {selectedFile && (
            <p>
              <small>Selected File: {selectedFile.name}</small>
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          <Button
            type="button"
            onClick={handleFileImport}
            disabled={!selectedFile}
          >
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

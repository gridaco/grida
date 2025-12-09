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

export function ImportFromGridaFileJsonDialog({
  onImport,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  onImport?: (document: io.LoadedDocument) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const validateFile = (file: File) => {
    return (
      file.name.toLowerCase().endsWith(".grida") ||
      file.name.toLowerCase().endsWith(".json")
    );
  };

  const handleFileImport = async () => {
    if (selectedFile) {
      try {
        const doc = await io.load(selectedFile);
        onImport?.(doc);
        toast.success("File successfully imported!");
        props.onOpenChange?.(false); // Close the dialog
        setSelectedFile(null);
      } catch (error) {
        toast.error("Failed to parse the file. Please check the format.");
        console.error(error);
      }
    } else {
      toast.error("No file selected.");
    }
  };

  return (
    <Dialog {...props}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import from .grida File</DialogTitle>
          <DialogDescription>
            Import a document from a .grida or .json file.
            <br />
            <small>Supported file formats: .grida, .json</small>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Label>Select a .grida file</Label>
          <FileDropzone
            accept=".grida,.json"
            onFileSelected={setSelectedFile}
            buttonText="Select File or Drag & Drop"
            dragText="Drop file here"
            errorMessage="Please drop a .grida or .json file"
            validateFile={validateFile}
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

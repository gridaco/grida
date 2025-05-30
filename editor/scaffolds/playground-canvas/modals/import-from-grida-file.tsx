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
import React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useFilePicker } from "use-file-picker";
import { Card } from "@/components/ui/card";
import { io } from "@grida/io";

export function ImportFromGridaFileJsonDialog({
  onImport,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  onImport?: (document: io.LoadedDocument) => void;
}) {
  const { openFilePicker, loading, plainFiles } = useFilePicker({
    accept: ".grida,.json",
    multiple: false,
  });

  const handleFileImport = async () => {
    if (plainFiles.length > 0) {
      try {
        const f = plainFiles[0];
        const doc = await io.load(f);
        onImport?.(doc);
        toast.success("File successfully imported!");
        props.onOpenChange?.(false); // Close the dialog
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
          <Card className="flex items-center justify-center p-0">
            <Button
              onClick={openFilePicker}
              disabled={loading}
              variant="ghost"
              className="w-full h-full p-10 "
            >
              {loading ? "Loading..." : "Select File"}
            </Button>
          </Card>
          {plainFiles.length > 0 && (
            <p>
              <small>Selected File: {plainFiles[0].name}</small>
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
            disabled={plainFiles.length === 0}
          >
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import React, { useState, useCallback } from "react";
import { useFilePicker } from "use-file-picker";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface FileDropzoneProps {
  accept: string;
  onFileSelected: (file: File) => void;
  buttonText?: string;
  loadingText?: string;
  dragText?: string;
  errorMessage?: string;
  validateFile?: (file: File) => boolean;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
}

export function FileDropzone({
  accept,
  onFileSelected,
  buttonText = "Select File or Drag & Drop",
  loadingText = "Loading...",
  dragText = "Drop file here",
  errorMessage,
  validateFile,
  disabled = false,
  className,
  buttonClassName,
}: FileDropzoneProps) {
  const { openFilePicker, loading, plainFiles } = useFilePicker({
    accept,
    multiple: false,
  });
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      const file = files[0];

      if (!file) {
        return;
      }

      if (validateFile && !validateFile(file)) {
        toast.error(errorMessage || "Invalid file type");
        return;
      }

      onFileSelected(file);
    },
    [validateFile, errorMessage, onFileSelected]
  );

  const handleFilePickerClick = useCallback(() => {
    openFilePicker();
  }, [openFilePicker]);

  // Notify parent when file picker selects a file
  React.useEffect(() => {
    if (plainFiles.length > 0) {
      const file = plainFiles[0];
      if (validateFile && !validateFile(file)) {
        toast.error(errorMessage || "Invalid file type");
        return;
      }
      onFileSelected(file);
    }
  }, [plainFiles, validateFile, errorMessage, onFileSelected]);

  const isProcessing = loading || disabled;

  return (
    <Card
      className={`flex items-center justify-center p-0 transition-colors ${
        isDragging
          ? "border-2 border-primary bg-primary/5"
          : "border-2 border-dashed border-border"
      } ${className || ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Button
        onClick={handleFilePickerClick}
        disabled={isProcessing}
        variant="ghost"
        className={`w-full h-full p-10 ${buttonClassName || ""}`}
      >
        {isProcessing ? loadingText : isDragging ? dragText : buttonText}
      </Button>
    </Card>
  );
}

import React, { useState, useCallback } from "react";
import { useFilePicker } from "use-file-picker";
import { toast } from "sonner";
import { UploadIcon, FileIcon, LoaderIcon } from "lucide-react";

interface FileDropzoneProps {
  accept: string;
  onFileSelected: (file: File) => void;
  buttonText?: string;
  loadingText?: string;
  dragText?: string;
  errorMessage?: string;
  description?: string;
  validateFile?: (file: File) => boolean;
  disabled?: boolean;
  className?: string;
}

export function FileDropzone({
  accept,
  onFileSelected,
  buttonText = "Select File or Drag & Drop",
  loadingText = "Processing...",
  dragText = "Drop file here",
  description,
  errorMessage,
  validateFile,
  disabled = false,
  className,
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
    <button
      type="button"
      onClick={handleFilePickerClick}
      disabled={isProcessing}
      className={`group relative flex w-full h-48 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 transition-all cursor-pointer ${
        isDragging
          ? "border-primary bg-primary/5 scale-[1.01]"
          : "border-border hover:border-muted-foreground/40 hover:bg-muted/50"
      } ${isProcessing ? "opacity-60 pointer-events-none" : ""} ${className || ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={`flex size-10 items-center justify-center rounded-full transition-colors ${
          isDragging
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
        }`}
      >
        {isProcessing ? (
          <LoaderIcon className="size-5 animate-spin" />
        ) : isDragging ? (
          <FileIcon className="size-5" />
        ) : (
          <UploadIcon className="size-5" />
        )}
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm font-medium text-foreground">
          {isProcessing ? loadingText : isDragging ? dragText : buttonText}
        </span>
        {description && !isDragging && !isProcessing && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>
    </button>
  );
}

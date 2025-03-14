"use client";

import React, { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, File } from "lucide-react";
import { CSVPreview } from "./csv-preview";
import { Download, AlertCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";

type ImportStep = "upload" | "preview" | "importing" | "complete" | "error";

export function ImportCSVDialog({
  ...props
}: React.ComponentProps<typeof Dialog>) {
  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [previewData, setPreviewData] = useState<any[]>([]);

  const handleFileSelected = (selectedFile: File) => {
    setFile(selectedFile);
    // In a real implementation, you would parse the CSV here
    // and set the preview data
    setPreviewData([
      {
        name: "John Doe",
        email: "john@example.com",
        phone: "+1 (555) 123-4567",
        status: "Active",
      },
      {
        name: "Jane Smith",
        email: "jane@example.com",
        phone: "+1 (555) 987-6543",
        status: "Inactive",
      },
      // More preview rows would be shown here
    ]);
    setStep("preview");
  };

  const handleImport = () => {
    setStep("importing");

    // Simulate import progress
    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += 10;
      setProgress(currentProgress);

      if (currentProgress >= 100) {
        clearInterval(interval);
        setStep("complete");
      }
    }, 300);

    // In a real implementation, you would call your import function here
  };

  const resetImport = () => {
    setFile(null);
    setProgress(0);
    setPreviewData([]);
    setStep("upload");
  };

  const handleClose = () => {
    props.onOpenChange?.(false);
    // Reset the state after the dialog closes
    setTimeout(resetImport, 300);
  };

  return (
    <Dialog {...props}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Import Customers from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file to import customers into your CRM.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-6 py-4">
            <Link
              href="/objects/template-grida-customer-upload-csv-example.csv"
              download
            >
              <Button variant="outline">
                <Download className="size-4 me-2" />
                Download CSV Template
              </Button>
            </Link>

            <FileUploader onFileSelected={handleFileSelected} />

            <div className="prose prose-sm dark:prose-invert">
              <p>Your CSV file should include the following columns:</p>
              <ul>
                <li>{"name - Customer's full name"}</li>
                <li>{"email - Customer's email address"}</li>
                <li>{"phone - Customer's phone number"}</li>
                <li>{"status - Customer's status (Active/Inactive)"}</li>
              </ul>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-6 py-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Preview Import Data</h3>
              <div className="text-sm text-muted-foreground">
                {file?.name} ({previewData.length} records)
              </div>
            </div>

            <CSVPreview data={previewData} />

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please review the data before importing. This will add new
                customers to your CRM.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {step === "importing" && (
          <div className="space-y-6 py-8">
            <div className="text-center">
              <h3 className="text-lg font-medium mb-2">Importing Customers</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Please wait while we import your customers...
              </p>
              <Progress value={progress} className="h-2 w-full" />
              <p className="text-sm text-muted-foreground mt-2">
                {Math.round(progress)}% complete
              </p>
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="space-y-6 py-8">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-4">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-lg font-medium mb-2">Import Complete</h3>
              <p className="text-sm text-muted-foreground">
                Successfully imported {previewData.length} customers to your
                CRM.
              </p>
            </div>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-6 py-8">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-4">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-medium mb-2">Import Failed</h3>
              <p className="text-sm text-muted-foreground">
                There was an error importing your customers. Please try again.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "upload" && (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}

          {step === "preview" && (
            <>
              <Button variant="outline" onClick={resetImport}>
                Back
              </Button>
              <Button onClick={handleImport}>Import Customers</Button>
            </>
          )}

          {(step === "complete" || step === "error") && (
            <Button onClick={handleClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface FileUploaderProps {
  onFileSelected: (file: File) => void;
}

function FileUploader({ onFileSelected }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type === "text/csv" || file.name.endsWith(".csv")) {
        onFileSelected(file);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelected(e.target.files[0]);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center ${
        isDragging
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv"
        className="hidden"
      />

      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <File className="h-6 w-6 text-muted-foreground" />
      </div>

      <div className="mt-4 flex flex-col items-center justify-center text-sm">
        <p className="mb-1 font-medium">
          <span className="text-primary">Click to upload</span> or drag and drop
        </p>
        <p className="text-muted-foreground">CSV files only (max 10MB)</p>
      </div>

      <Button variant="outline" onClick={handleButtonClick} className="mt-4">
        <Upload className="mr-2 h-4 w-4" />
        Select CSV File
      </Button>
    </div>
  );
}

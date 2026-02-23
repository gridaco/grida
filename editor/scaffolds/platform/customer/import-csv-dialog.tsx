"use client";

import React, { useState, useRef } from "react";
import Papa from "papaparse";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui-editor/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Upload, File } from "lucide-react";
import { SimpleCSVTable } from "@/components/table/simple-csv-table";
import { Download, AlertCircle, CheckCircle2 } from "lucide-react";
import { OpenInNewWindowIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { useProject } from "@/scaffolds/workspace";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Platform } from "@/lib/platform";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Field, FieldLabel } from "@/components/ui/field";

type ImportStep = "upload" | "preview" | "importing" | "complete" | "error";

export function ImportCSVDialog({
  onImportComplete,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  onImportComplete?: () => void;
}) {
  const project = useProject();
  const [mode, setMode] = useState<"insert" | "update">("insert");
  const [datachecked, setDataChecked] = useState(false);
  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<unknown | null>(null);
  const [csv, setCsv] = useState<any[]>([]);
  const [sample, setSample] = useState<any[]>([]);

  const handleFileSelected = (selectedFile: File) => {
    setFile(selectedFile);
    Papa.parse(selectedFile, {
      ...Platform.CSV.parser_config,
      complete: (results) => {
        setCsv(results.data);
        setSample(results.data.slice(0, Math.min(results.data.length, 100)));
        setStep("preview");
      },
      error: (err) => {
        console.error("CSV parse error:", err);
      },
    });
  };

  const handleImport = () => {
    setStep("importing");

    const formdata = new FormData();
    formdata.append("csv", file as Blob);

    const methods = {
      insert: "POST",
      update: "PATCH",
    };

    fetch(`/private/customers/${project.id}/with-csv`, {
      method: methods[mode],
      body: formdata,
    }).then((res) => {
      if (res.ok) {
        setStep("complete");
        onImportComplete?.();
      } else {
        setStep("error");
        res.json().then((res) => {
          setError(res.error);
          console.error("Import error:", res.error);
        });
      }
    });
  };

  const resetImport = () => {
    setFile(null);
    setSample([]);
    setStep("upload");
  };

  const handleClose = () => {
    props.onOpenChange?.(false);
    // Reset the state after the dialog closes
    setTimeout(resetImport, 300);
  };

  return (
    <Dialog {...props}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import Customers from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file to import customers into your CRM.
            <br />
            <Link
              href="/docs/platform/customers#working-with-csv"
              target="_blank"
              className="underline"
            >
              <OpenInNewWindowIcon className="me-2 inline" />
              Read the docs
            </Link>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-4">
          <Tabs
            value={mode}
            onValueChange={(v) => setMode(v as "insert" | "update")}
          >
            <TabsList>
              <TabsTrigger value="insert">Insert</TabsTrigger>
              <TabsTrigger value="update">Update</TabsTrigger>
            </TabsList>
          </Tabs>
          {step === "upload" && (
            <Link
              href="/objects/template-grida-customer-upload-csv-example.zip"
              download
            >
              <Button variant="outline">
                <Download className="size-4 me-2" />
                Download Template
              </Button>
            </Link>
          )}
        </div>

        {step === "upload" && (
          <div className="space-y-6 py-4">
            <FileUploader onFileSelected={handleFileSelected} />
          </div>
        )}

        {step === "preview" && (
          <div className="flex flex-col space-y-6 py-4 max-w-full overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Preview Import Data</h3>
              <div className="text-sm text-muted-foreground">
                {file?.name} (first {sample.length} records of {csv.length})
              </div>
            </div>

            <ScrollArea className="max-h-[400px] rounded-md border overflow-scroll">
              <SimpleCSVTable data={sample} count={csv.length} />
            </ScrollArea>

            <Alert>
              <AlertCircle className="size-4" />
              <AlertTitle>Review your data</AlertTitle>
              <AlertDescription>
                Please review the data before importing. This action cannot be
                undone.
              </AlertDescription>
            </Alert>
            <Field orientation="horizontal">
              <Checkbox
                id="import-csv-dialog-data-checked"
                checked={datachecked}
                onCheckedChange={(s) => setDataChecked(s === true)}
              />
              <FieldLabel
                htmlFor="import-csv-dialog-data-checked"
                className="font-normal"
              >
                I&apos;ve reviewed the data and want to import these customers
              </FieldLabel>
            </Field>
            <label className="flex items-center space-x-2 cursor-pointer mt-2 w-full">
              <span></span>
            </label>
          </div>
        )}

        {step === "importing" && (
          <div className="space-y-6 py-8">
            <div className="text-center">
              <h3 className="text-lg font-medium mb-2">Importing Customers</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Please wait while we import your customers...
              </p>
              <Progress indeterminate className="h-2 w-full" />
              <p className="text-sm text-muted-foreground mt-2">
                Importing {csv.length} customers
              </p>
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="space-y-6 py-8">
            <div className="text-center">
              <div className="mx-auto flex w-20 h-20 items-center justify-center rounded-full bg-green-100 mb-4">
                <CheckCircle2 className="size-10 text-green-600" />
              </div>
              <h3 className="text-lg font-medium mb-2">Import Complete</h3>
              <p className="text-sm text-muted-foreground">
                Successfully imported {csv.length} customers to your CRM.
              </p>
            </div>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-6 py-8">
            <div className="text-center">
              <div className="mx-auto flex w-20 h-20 items-center justify-center rounded-full bg-red-100 mb-4">
                <AlertCircle className="size-10 text-red-600" />
              </div>
              <h3 className="text-lg font-medium mb-2">Import Failed</h3>
              <p className="text-sm text-muted-foreground">
                There was an error importing your customers. Please try again.
              </p>
              <div className="max-h-[400px] rounded-md border mt-4 overflow-scroll p-4">
                <p className="text-xs text-start text-destructive font-mono">
                  <pre>
                    {error ? JSON.stringify(error, null, 2) : "Unknown error"}
                  </pre>
                </p>
              </div>
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
              <Button disabled={!datachecked} onClick={handleImport}>
                Import Customers
              </Button>
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

      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
        <File className="size-6 text-muted-foreground" />
      </div>

      <div className="mt-4 flex flex-col items-center justify-center text-sm">
        <p className="mb-1 font-medium">
          <span className="text-primary">Click to upload</span> or drag and drop
        </p>
        <p className="text-muted-foreground">CSV files only</p>
      </div>

      <Button variant="outline" onClick={handleButtonClick} className="mt-4">
        <Upload className="size-4" />
        Select CSV File
      </Button>
    </div>
  );
}

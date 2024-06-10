"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  FileUploader,
  FileUploaderTrigger,
  FileValue,
  FileUploaderContent,
  FileUploaderItem,
  UploadedFileValue,
} from "@/components/extension/file-upload";
import { Spinner } from "@/components/spinner";
import { Card } from "@/components/ui/card";
import { FileIcon } from "@radix-ui/react-icons";
import { DropzoneOptions } from "react-dropzone";
import { FileUploaderFn } from "./uploader";
import Image from "next/image";
import { UploadStatus, useFileUploader } from "./use-file-uploader";

type Accept = {
  [key: string]: string[];
};

type FileUploadDropzoneProps = {
  name?: string;
  accept?: string;
  multiple?: boolean;
  required?: boolean;
  maxSize?: number;
  maxFiles?: number;
  uploader?: FileUploaderFn;
};

export const FileUploadDropzone = ({
  name,
  accept,
  multiple,
  maxSize,
  maxFiles,
  required,
  uploader,
}: FileUploadDropzoneProps) => {
  const [files, setFiles] = useState<File[]>([]);
  const { isUploading, getUploadStatus, uploadedFiles } = useFileUploader({
    files,
    uploader,
  });

  const dropzone = {
    accept: accept?.split(",").reduce((acc: Accept, type) => {
      acc[type] = [];
      return acc;
    }, {}),
    maxFiles: maxFiles,
    multiple: multiple,
    maxSize: maxSize,
  } satisfies DropzoneOptions;

  const handleValueChange = (newFiles: File[] | null) => {
    setFiles(newFiles || []);
  };

  const isMultipartFile = !uploader;

  return (
    <FileUploader
      value={files}
      onValueChange={handleValueChange}
      dropzoneOptions={dropzone}
      includeFiles={isMultipartFile}
    >
      {isMultipartFile && <FileValue name={name} required={required} />}
      {!isMultipartFile && (
        <UploadedFileValue
          name={name}
          required={required}
          value={
            uploadedFiles.length > 0
              ? uploadedFiles.map((file) => file.path)
              : undefined
          }
        />
      )}
      <FileUploaderTrigger>
        <Card>
          <div className="flex items-center justify-center h-40 w-full rounded-md">
            <p className="text-muted-foreground text-center">
              <span>
                <FileIcon className="inline me-2 align-middle" />
                {multiple ? "Drop files here" : "Drop a file here"}
              </span>
              <br />
              <span className="text-xs text-muted-foreground">
                {accept ? `Accepted files: ${accept}` : "Any file type"}
              </span>
            </p>
          </div>
        </Card>
      </FileUploaderTrigger>
      <FileUploaderContent className="flex items-center flex-row gap-2">
        {files?.map((file, i) => (
          <FileUploaderItem
            key={i}
            index={i}
            className="h-20 p-0 rounded-md overflow-hidden"
            aria-roledescription={`file ${i + 1} containing ${file.name}`}
          >
            <FilePreview file={file} status={getUploadStatus(i)} />
          </FileUploaderItem>
        ))}
      </FileUploaderContent>
    </FileUploader>
  );
};

function FilePreview({ file, status }: { file: File; status: UploadStatus }) {
  const src = useMemo(() => URL.createObjectURL(file), [file]);

  if (file.type.startsWith("image/")) {
    return (
      <div className="relative">
        <Image
          className="size-20 rounded-md object-cover"
          src={src}
          alt={file.name}
          height={80}
          width={80}
        />
        {status !== "uploaded" && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <Spinner />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full flex justify-center gap-2 p-2 items-center">
      <FileIcon className="w-8 h-8" />
      <span className="pr-4 inline-block max-w-40 break-all whitespace-normal text-xs text-muted-foreground">
        {file.name}
      </span>
    </div>
  );
}

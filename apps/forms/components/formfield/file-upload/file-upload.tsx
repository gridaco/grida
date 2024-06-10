"use client";

import {
  FileUploader,
  FileUploaderTrigger,
  FileInput,
  FileUploaderContent,
  FileUploaderItem,
} from "@/components/extension/file-upload";
import { Spinner } from "@/components/spinner";
import { Card } from "@/components/ui/card";
import { FileIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import { useMemo, useState, useCallback, useEffect } from "react";
import { DropzoneOptions } from "react-dropzone";

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
  uploader?: (
    file: File,
    i: number
  ) => Promise<{
    path?: string;
  }>;
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
  const { isUploading, getUploadStatus } = useFileUploader(files, uploader);

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

  return (
    <FileUploader
      value={files}
      onValueChange={handleValueChange}
      dropzoneOptions={dropzone}
    >
      <FileInput name={name} required={required} />
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
      <FileIcon className="w-10 h-10" />
      <span className="pr-4 inline-block max-w-40 break-all whitespace-normal text-xs text-muted-foreground">
        {file.name}
      </span>
    </div>
  );
}

type UploadStatus = "pending" | "uploading" | "uploaded" | "failed";

const useFileUploader = (
  files: File[],
  uploader?: (file: File, i: number) => Promise<{ path?: string }>
) => {
  const [uploadStatus, setUploadStatus] = useState<UploadStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (files.length > 0) {
      setUploadStatus(new Array(files.length).fill("pending"));
    }
  }, [files]);

  const getUploadStatus = (index: number) => uploadStatus[index];

  useEffect(() => {
    const startUploading = async () => {
      if (!uploader) return;

      setIsUploading(true);
      const status = [...uploadStatus];
      try {
        for (let i = 0; i < files.length; i++) {
          if (status[i] === "pending") {
            status[i] = "uploading";
            setUploadStatus([...status]);
            try {
              const { path } = await uploader(files[i], i);
              if (!!path) {
                status[i] = "uploaded";
              } else {
                status[i] = "failed";
              }
            } catch {
              status[i] = "failed";
            }
            setUploadStatus([...status]);
          }
        }
      } finally {
        setIsUploading(false);
      }
    };

    startUploading();
  }, [files, uploader, uploadStatus]);

  return { isUploading, getUploadStatus };
};

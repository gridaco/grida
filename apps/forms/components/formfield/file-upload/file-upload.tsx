"use client";

import {
  FileUploader,
  FileUploaderTrigger,
  FileInput,
  FileUploaderContent,
  FileUploaderItem,
} from "@/components/extension/file-upload";
import { Card } from "@/components/ui/card";
import { FileIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import { useMemo, useState } from "react";
import { DropzoneOptions } from "react-dropzone";

type Accept = {
  [key: string]: string[];
};

export const FileUploadDropzone = ({
  name,
  accept,
  multiple,
  maxSize,
  maxFiles,
  required,
}: {
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
    url: string;
  }>;
}) => {
  const [files, setFiles] = useState<File[] | null>([]);

  const dropzone = {
    accept: accept?.split(",").reduce((acc: Accept, type) => {
      acc[type] = [];
      return acc;
    }, {}),
    maxFiles: maxFiles,
    multiple: multiple,
    maxSize: maxSize,
  } satisfies DropzoneOptions;

  return (
    <FileUploader
      value={files}
      onValueChange={setFiles}
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
            <FilePreview file={file} />
          </FileUploaderItem>
        ))}
      </FileUploaderContent>
    </FileUploader>
  );
};

function FilePreview({ file }: { file: File }) {
  const src = useMemo(() => URL.createObjectURL(file), [file]);

  if (file.type.startsWith("image/")) {
    return (
      <Image
        className="size-20 rounded-md object-cover"
        src={src}
        alt={file.name}
        height={80}
        width={80}
      />
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

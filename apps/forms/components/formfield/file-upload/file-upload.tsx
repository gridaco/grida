"use client";

import {
  FileUploader,
  FileInput,
  FileUploaderContent,
  FileUploaderItem,
} from "@/components/extension/file-upload";
import Image from "next/image";
import { useState } from "react";
import { DropzoneOptions } from "react-dropzone";

type Accept = {
  [key: string]: string[];
};
export const FileUploadDropzone = ({
  name,
  accept,
  multiple,
  maxSize,
}: {
  name?: string;
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
}) => {
  const [files, setFiles] = useState<File[] | null>([]);

  const dropzone = {
    accept: accept?.split(",").reduce((acc: Accept, type) => {
      acc[type] = [];
      return acc;
    }, {}),
    multiple: multiple,
    maxSize: maxSize,
  } satisfies DropzoneOptions;

  return (
    <FileUploader
      value={files}
      onValueChange={setFiles}
      dropzoneOptions={dropzone}
      inputName={name}
    >
      <FileInput>
        <div className="flex items-center justify-center h-32 w-full border bg-background rounded-md">
          <p className="text-muted-foreground">Drop files here</p>
        </div>
      </FileInput>
      <FileUploaderContent className="flex items-center flex-row gap-2">
        {files?.map((file, i) => (
          <FileUploaderItem
            key={i}
            index={i}
            className="size-20 p-0 rounded-md overflow-hidden"
            aria-roledescription={`file ${i + 1} containing ${file.name}`}
          >
            <Image
              src={URL.createObjectURL(file)}
              alt={file.name}
              height={80}
              width={80}
              className="size-20 p-0"
            />
          </FileUploaderItem>
        ))}
      </FileUploaderContent>
    </FileUploader>
  );
};

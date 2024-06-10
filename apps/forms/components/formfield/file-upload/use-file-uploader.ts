import { useMemo, useState, useCallback, useEffect } from "react";
import type { FileUploaderFn } from "./uploader";

export type UploadStatus = "pending" | "uploading" | "uploaded" | "failed";

/**
 * Hook to manage file uploading
 *
 * This hook internally manages file uploading on each file and returns easy to access functions and status.
 * It prevents from same file being uploaded multiple times.
 *
 * @param files - user selected files
 * @param uploader - function to upload a file
 * @returns {isUploading, getStatus, data}
 */
export const useFileUploader = ({
  files,
  uploader,
  getKey = (file) => file.name + file.size + file.type + file.lastModified,
}: {
  files: File[];
  uploader?: FileUploaderFn;
  getKey?: (file: File) => string;
}) => {
  const [uploadStatus, setUploadStatus] = useState<UploadStatus[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<{ path: string }[]>([]);
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
      const uploadedFilesTemp: { path: string }[] = [];
      try {
        for (let i = 0; i < files.length; i++) {
          if (status[i] === "pending") {
            status[i] = "uploading";
            setUploadStatus([...status]);
            try {
              const { path } = await uploader(files[i]);
              if (path) {
                status[i] = "uploaded";
                uploadedFilesTemp.push({ path });
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
        setUploadedFiles(uploadedFilesTemp);
      }
    };

    startUploading();
  }, [files, uploader, uploadStatus]);

  return { isUploading, getUploadStatus, uploadedFiles };
};

import { useMemo, useState, useCallback, useEffect, useRef } from "react";

type FileUploaderFn = (file: File) => Promise<{ path?: string }>;
export type UploadStatus = "pending" | "uploading" | "uploaded" | "failed";

interface FileUploadInfo {
  file: File;
  status: UploadStatus;
  path?: string;
}

interface UseFileUploaderArgs {
  files: File[];
  uploader?: FileUploaderFn;
  autoUpload?: boolean;
  getKey?: (file: File) => string;
}

/**
 * Hook to manage file uploading
 *
 * This hook internally manages file uploading on each file and returns easy to access functions and status.
 * It prevents from same file being uploaded multiple times.
 *
 *
 * @param files - user selected files
 * @param uploader - function to upload a file
 * @param autoUpload - if true, files will be uploaded automatically on file selection change
 * @returns { startUpload, isUploading, getStatus, data }
 */
export const useFileUploader = ({
  files,
  uploader,
  autoUpload,
  getKey = (file) => file.name + file.size + file.type + file.lastModified,
}: UseFileUploaderArgs) => {
  const fileStatusRef = useRef<Record<string, FileUploadInfo>>({});
  const [fileUploadInfos, setFileUploadInfos] = useState<FileUploadInfo[]>([]);

  useEffect(() => {
    let updated = false;
    const newFileUploadInfos = files.map((file) => {
      const key = getKey(file);
      if (!fileStatusRef.current[key]) {
        updated = true;
        fileStatusRef.current[key] = { file, status: "pending" };
      }
      return fileStatusRef.current[key];
    });

    if (updated) {
      setFileUploadInfos(newFileUploadInfos);
    }
  }, [files, getKey]);

  const startUpload = useCallback(
    async (file: File) => {
      const key = getKey(file);
      const fileInfo = fileStatusRef.current[key];

      if (!fileInfo || fileInfo.status !== "pending") {
        return;
      }

      fileInfo.status = "uploading";
      setFileUploadInfos((prev) =>
        prev.map((info) =>
          getKey(info.file) === key ? { ...info, status: "uploading" } : info
        )
      );

      try {
        if (!uploader) {
          throw new Error("Uploader function is not provided");
        }

        const result = await uploader(file);
        fileInfo.status = "uploaded";
        fileInfo.path = result.path;
        setFileUploadInfos((prev) =>
          prev.map((info) =>
            getKey(info.file) === key
              ? { ...info, status: "uploaded", path: result.path }
              : info
          )
        );
      } catch (error) {
        fileInfo.status = "failed";
        setFileUploadInfos((prev) =>
          prev.map((info) =>
            getKey(info.file) === key ? { ...info, status: "failed" } : info
          )
        );
      }
    },
    [uploader, getKey]
  );

  useEffect(() => {
    if (autoUpload) {
      files.forEach((file) => {
        const key = getKey(file);
        if (fileStatusRef.current[key].status === "pending") {
          startUpload(file);
        }
      });
    }
  }, [autoUpload, files, startUpload, getKey]);

  const isUploading = useMemo(
    () => fileUploadInfos.some((info) => info.status === "uploading"),
    [fileUploadInfos]
  );

  const getStatus = useCallback(
    (file: File) => {
      const key = getKey(file);
      const fileInfo = fileStatusRef.current[key];
      return fileInfo ? fileInfo.status : "pending";
    },
    [getKey]
  );

  const data = useMemo(() => fileUploadInfos, [fileUploadInfos]);

  return { startUpload, isUploading, getStatus, data };
};

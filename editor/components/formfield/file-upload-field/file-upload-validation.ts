export function shouldBlockSubmitForFileUpload(args: {
  isMultipartFile?: boolean;
  selectedFilesCount: number;
  uploadedFilesCount: number;
  isUploading: boolean;
}): boolean {
  if (args.isMultipartFile) return false;
  if (args.selectedFilesCount === 0) return false;

  return args.isUploading || args.uploadedFilesCount < args.selectedFilesCount;
}

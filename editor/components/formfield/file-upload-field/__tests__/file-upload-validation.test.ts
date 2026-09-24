import { describe, expect, test } from "vitest";
import { shouldBlockSubmitForFileUpload } from "../file-upload-validation";

describe("shouldBlockSubmitForFileUpload", () => {
  test("does not block an untouched optional upload field", () => {
    expect(
      shouldBlockSubmitForFileUpload({
        selectedFilesCount: 0,
        uploadedFilesCount: 0,
        isUploading: false,
      })
    ).toBe(false);
  });

  test("blocks when a selected file has not produced an uploaded path yet", () => {
    expect(
      shouldBlockSubmitForFileUpload({
        selectedFilesCount: 1,
        uploadedFilesCount: 0,
        isUploading: true,
      })
    ).toBe(true);
  });

  test("allows submit after each selected file has an uploaded path", () => {
    expect(
      shouldBlockSubmitForFileUpload({
        selectedFilesCount: 2,
        uploadedFilesCount: 2,
        isUploading: false,
      })
    ).toBe(false);
  });

  test("does not block multipart file uploads", () => {
    expect(
      shouldBlockSubmitForFileUpload({
        isMultipartFile: true,
        selectedFilesCount: 1,
        uploadedFilesCount: 0,
        isUploading: true,
      })
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { FileReferenceRequest } from "./file-reference-request";

// GRIDA-SEC-004 — a reference's path comes only from the person's File.
const dropped = new File(["clip"], "clip.mov", { type: "video/quicktime" });
const built = new File(["page"], "page.txt");
const paths = new Map<File, string>([[dropped, "/Users/someone/clip.mov"]]);
const pathFor = (file: File) => {
  if (!(file instanceof File)) throw new TypeError("not a File");
  return paths.get(file) ?? "";
};
const input = {
  action: "submit",
  inputId: "reference",
  text: "Look at this.",
  file: dropped,
  mimeType: "video/quicktime",
  operatingRegime: "act",
};

describe("FileReferenceRequest", () => {
  it("replaces the person's File with its resolved path", () => {
    expect(FileReferenceRequest.available(dropped, pathFor)).toBe(true);
    expect(FileReferenceRequest.from(input, pathFor)).toEqual({
      action: "submit",
      inputId: "reference",
      text: "Look at this.",
      mimeType: "video/quicktime",
      operatingRegime: "act",
      path: "/Users/someone/clip.mov",
    });
  });

  it("refuses a File without a disk path and anything that is not a File", () => {
    for (const file of [built, "/etc/passwd", { name: "x" }, undefined]) {
      expect(FileReferenceRequest.available(file, pathFor)).toBe(false);
      expect(() =>
        FileReferenceRequest.from({ ...input, file }, pathFor)
      ).toThrow("native_chat_file_reference_unavailable");
    }
  });

  it("preserves a dropped directory's exact disk-backed handle through path resolution", () => {
    const folder = new File([], "assets");
    const resolve = (file: File) => (file === folder ? "/project/assets" : "");
    expect(FileReferenceRequest.available(folder, resolve)).toBe(true);
    expect(
      FileReferenceRequest.from({ ...input, file: folder }, resolve)
    ).toEqual({
      action: "submit",
      inputId: "reference",
      text: "Look at this.",
      mimeType: "video/quicktime",
      operatingRegime: "act",
      path: "/project/assets",
    });
    expect(
      FileReferenceRequest.available(new File([], "assets"), resolve)
    ).toBe(false);
  });

  it("refuses a path supplied by the page", () => {
    expect(() =>
      FileReferenceRequest.from(
        { ...input, path: "/Users/someone/.ssh/id_ed25519" },
        pathFor
      )
    ).toThrow("native_chat_file_reference_unavailable");
    expect(() => FileReferenceRequest.from(null, pathFor)).toThrow(
      "native_chat_file_reference_unavailable"
    );
  });
});

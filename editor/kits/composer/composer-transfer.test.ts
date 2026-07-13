import { describe, expect, it } from "vitest";
import { ComposerTransfer } from "./composer-transfer";

function item(file: File | null, directory?: boolean): DataTransferItem {
  return {
    kind: "file",
    type: file?.type ?? "",
    getAsFile: () => file,
    webkitGetAsEntry: () =>
      directory === undefined ? null : { isDirectory: directory },
  } as unknown as DataTransferItem;
}

function transfer(files: File[], items: DataTransferItem[]): DataTransfer {
  return { files, items } as unknown as DataTransfer;
}

describe("ComposerTransfer", () => {
  it("splits a directory from ordinary files without cloning either File", () => {
    const folder = new File([], "reference-material", { type: "" });
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });

    const result = ComposerTransfer.splitDrop(
      transfer([folder, file], [item(folder, true), item(file, false)])
    );

    expect(result.directories).toEqual([folder]);
    expect(result.files).toEqual([file]);
    expect(result.directories[0]).toBe(folder);
    expect(result.files[0]).toBe(file);
  });

  it("does not mistake an unknown-MIME regular file for a directory", () => {
    const extensionless = new File(["#!/bin/sh"], "run", { type: "" });
    expect(
      ComposerTransfer.splitDrop(
        transfer([extensionless], [item(extensionless, false)])
      )
    ).toEqual({ files: [extensionless], directories: [] });
  });

  it("falls back to DataTransfer.files when item metadata is unavailable", () => {
    const file = new File(["x"], "unknown");
    expect(ComposerTransfer.splitDrop(transfer([file], []))).toEqual({
      files: [file],
      directories: [],
    });
  });

  it("uses the live DataTransfer.files directory when getAsFile is null", () => {
    const folder = new File([], "photos");
    expect(
      ComposerTransfer.splitDrop(transfer([folder], [item(null, true)]))
        .directories[0]
    ).toBe(folder);
  });

  it("never interprets pasted files as directory grants", () => {
    const file = new File([], "folder-shaped", { type: "" });
    expect(
      ComposerTransfer.pasteFiles(transfer([file], [item(file, true)]))
    ).toEqual([file]);
  });
});

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
  it("preserves drop provenance, resource order, kind, and original File objects", () => {
    const folder = new File([], "reference-material", { type: "" });
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });

    const result = ComposerTransfer.fromDrop(
      transfer([folder, file], [item(folder, true), item(file, false)])
    );

    expect(result).toEqual({
      source: "drop",
      resources: [
        { kind: "directory", file: folder },
        { kind: "file", file },
      ],
    });
    expect(result.resources[0].file).toBe(folder);
    expect(result.resources[1].file).toBe(file);
  });

  it("does not mistake an unknown-MIME regular file for a directory", () => {
    const extensionless = new File(["#!/bin/sh"], "run", { type: "" });
    expect(
      ComposerTransfer.fromDrop(
        transfer([extensionless], [item(extensionless, false)])
      )
    ).toEqual({
      source: "drop",
      resources: [{ kind: "file", file: extensionless }],
    });
  });

  it("falls back to DataTransfer.files when item metadata is unavailable", () => {
    const file = new File(["x"], "unknown");
    expect(ComposerTransfer.fromDrop(transfer([file], []))).toEqual({
      source: "drop",
      resources: [{ kind: "file", file }],
    });
  });

  it("uses the live DataTransfer.files directory when getAsFile is null", () => {
    const folder = new File([], "photos");
    expect(
      ComposerTransfer.fromDrop(transfer([folder], [item(null, true)]))
        .resources[0].file
    ).toBe(folder);
  });

  it("preserves paste provenance and never interprets copied files as directories", () => {
    const file = new File([], "folder-shaped", { type: "" });
    expect(
      ComposerTransfer.fromPaste(transfer([file], [item(file, true)]))
    ).toEqual({
      source: "paste",
      resources: [{ kind: "file", file }],
    });
  });

  it("projects source-aware events onto the legacy split callback shape", () => {
    const file = new File(["x"], "notes.txt");
    const folder = new File([], "references");
    expect(
      ComposerTransfer.split({
        source: "drop",
        resources: [
          { kind: "file", file },
          { kind: "directory", file: folder },
        ],
      })
    ).toEqual({ files: [file], directories: [folder] });

    expect(
      ComposerTransfer.splitDrop(
        transfer([folder, file], [item(folder, true), item(file, false)])
      )
    ).toEqual({ files: [file], directories: [folder] });
    expect(
      ComposerTransfer.pasteFiles(transfer([file], [item(file, true)]))
    ).toEqual([file]);
  });
});

import { expect, it, vi } from "vitest";
import { AttachmentBatchRequest } from "./attachment-batch-request";
import { SelectedImageRequest } from "./selected-image-request";

it("prepares each selection in order and resolves paths only from genuine Files", async () => {
  const photo = new File(["photo"], "view.jpg");
  const folder = new File([], "folder");
  const resolve = vi.fn<(file: File) => string>((file) =>
    file === photo
      ? "/picked/view.jpg"
      : file === folder
        ? "/picked/folder"
        : ""
  );
  const bytes = Uint8Array.of(1, 2).buffer;
  const output = await AttachmentBatchRequest.prepare(
    [
      { kind: "keep", index: 1 },
      { kind: "file", name: "notes.txt", bytes },
      { kind: "image", file: photo },
      { kind: "reference", file: folder },
      { kind: "png", name: "clipboard.png", bytes },
    ],
    resolve,
    true
  );
  expect(output).toEqual([
    { kind: "keep", index: 1 },
    { kind: "file", name: "notes.txt", bytes },
    {
      kind: "image",
      name: "view.jpg",
      path: "/picked/view.jpg",
      size: 5,
      lastModified: photo.lastModified,
      sha256: expect.any(Array),
    },
    { kind: "reference", path: "/picked/folder" },
    {
      kind: "image",
      name: "clipboard.png",
      bytes,
      size: 2,
      lastModified: expect.any(Number),
      sha256: expect.any(Array),
    },
  ]);
  expect(resolve.mock.calls.map(([file]) => file.name)).toEqual([
    "view.jpg",
    "folder",
    "clipboard.png",
  ]);
});

it("rejects forged paths, unscoped keep entries and an oversized batch", async () => {
  const resolve = vi.fn<() => string>(() => "/unexpected");
  await expect(
    AttachmentBatchRequest.prepare(
      [{ kind: "reference", file: new File([], "folder"), path: "/protected" }],
      resolve,
      false
    )
  ).rejects.toThrow("native_chat_attachments_invalid");
  await expect(
    AttachmentBatchRequest.prepare([{ kind: "keep", index: 0 }], resolve, false)
  ).rejects.toThrow("queue_attachment_unavailable");
  await expect(
    AttachmentBatchRequest.prepare(
      [
        { kind: "keep", index: 0 },
        { kind: "keep", index: 0 },
      ],
      resolve,
      true
    )
  ).rejects.toThrow("queue_attachment_unavailable");
  const piece = {
    kind: "file",
    name: "notes.txt",
    bytes: new ArrayBuffer(AttachmentBatchRequest.maxFileBytes),
  };
  await expect(
    AttachmentBatchRequest.prepare([piece, piece], resolve, false)
  ).resolves.toEqual([piece, piece]);
  await expect(
    AttachmentBatchRequest.prepare(
      [
        {
          ...piece,
          bytes: new ArrayBuffer(AttachmentBatchRequest.maxFileBytes + 1),
        },
      ],
      resolve,
      false
    )
  ).rejects.toThrow("file_size_limit");
  await expect(
    AttachmentBatchRequest.prepare(
      Array.from({ length: AttachmentBatchRequest.maxItems + 1 }, () => piece),
      resolve,
      false
    )
  ).rejects.toThrow("attachment_count_limit");
  expect(resolve).not.toHaveBeenCalled();
});

it("normalizes a local File read failure before any native request exists", async () => {
  const read = vi
    .spyOn(SelectedImageRequest, "from")
    .mockRejectedValueOnce(
      new DOMException("Source read failed", "NotReadableError")
    );
  try {
    await expect(
      AttachmentBatchRequest.prepare(
        [{ kind: "image", file: new File(["photo"], "preview.png") }],
        () => "",
        true
      )
    ).rejects.toThrow("native_chat_attachment_preparation_failed");
  } finally {
    read.mockRestore();
  }
});

import { describe, expect, it, vi } from "vitest";
import {
  USER_DIRECTORY_REFERENCES,
  USER_FILE_ATTACHMENTS,
  type DirectoryScopeDescriptor,
} from "@grida/agent";
import { InputResourcePolicy } from "./input-resource-policy";
import { InputResourceRouter } from "./input-resource-router";

const directoryId = "dir_11111111-1111-4111-8111-111111111111";
const directory = {
  kind: "scope",
  id: directoryId,
  name: "references",
  path: `/__references__/${directoryId}`,
  access: "read",
} as const;

function file(input: {
  name: string;
  type?: string;
  size?: number;
  bytes?: readonly number[];
}): File {
  const bytes = Uint8Array.from(input.bytes ?? [0, 0, 0]);
  return {
    name: input.name,
    type: input.type ?? "",
    size: input.size ?? bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  } as File;
}

function environment(
  input: {
    reference?: Partial<InputResourceRouter.Environment["reference"]>;
    attachment?: Partial<InputResourceRouter.Environment["attachment"]>;
    effects?: Partial<InputResourceRouter.Effects>;
  } = {}
): InputResourceRouter.Environment {
  return {
    reference: {
      path: true,
      url: true,
      attachDirectory: async () => directory,
      ...input.reference,
    },
    attachment: {
      provider: {
        inlineMimes: ["image/png", "image/jpeg"],
        remoteUrlMimes: [],
      },
      scratch: {
        maxFileBytes: 8 * 1024 * 1024,
        maxFiles: 64,
        maxTotalBytes: 8 * 1024 * 1024,
      },
      ...input.attachment,
    },
    effects: {
      encodeProviderUrl: async (source) => ({
        name: source.name,
        mime: source.mimeType,
        size: 3,
        url: `data:${source.mimeType};base64,AAAA`,
      }),
      ...input.effects,
    },
  };
}

function provider(
  inlineMimes: readonly string[] = [],
  remoteUrlMimes: readonly string[] = []
): InputResourceRouter.Environment["attachment"]["provider"] {
  return { inlineMimes, remoteUrlMimes };
}

describe("InputResourceRouter.prepare", () => {
  it("preserves gesture provenance while routing bytes by policy", async () => {
    const encodeProviderFile = vi.fn<
      InputResourceRouter.Effects["encodeProviderFile"]
    >(async () => ({
      name: "paste.png",
      mime: "image/png",
      size: 3,
      url: "data:image/png;base64,AAAA",
    }));
    const result = await InputResourceRouter.prepare(
      {
        kind: "browser-file",
        id: "paste-1",
        source: "paste",
        file: file({
          name: "paste.png",
          type: "image/png",
          bytes: [1, 2, 3],
        }),
      },
      environment({ effects: { encodeProviderFile } })
    );

    expect(result).toMatchObject({
      status: "accept",
      decision: {
        ruleId: "byte-image",
        route: {
          kind: "attachment",
          via: "provider-and-scratch",
          from: "bytes",
        },
      },
      materializedRoute: {
        kind: "attachment",
        via: "provider-and-scratch",
        from: "bytes",
      },
      resource: {
        kind: "provider-and-scratch-file",
        source: "paste",
        name: "paste.png",
        mimeType: "image/png",
        size: 3,
        base64: "AQID",
        provider: {
          name: "paste.png",
          mimeType: "image/png",
          size: 3,
          url: "data:image/png;base64,AAAA",
          representation: "inline-bytes",
        },
      },
    });
    expect(encodeProviderFile).toHaveBeenCalledOnce();
  });

  it("keeps the scratch fallback when provider output violates capability", async () => {
    const encodeProviderFile = vi.fn<
      InputResourceRouter.Effects["encodeProviderFile"]
    >(async () => ({
      name: "source.webp",
      mime: "image/webp",
      size: 3,
      url: "data:image/webp;base64,AAAA",
    }));
    const result = await InputResourceRouter.prepare(
      {
        kind: "browser-file",
        id: "webp-1",
        source: "picker",
        file: file({ name: "source.webp", type: "image/webp" }),
      },
      environment({
        attachment: {
          provider: { inlineMimes: ["image/png"], remoteUrlMimes: [] },
        },
        effects: { encodeProviderFile },
      })
    );

    expect(result).toMatchObject({
      status: "accept",
      decision: { route: { via: "provider-and-scratch" } },
      materializedRoute: {
        kind: "attachment",
        via: "scratch",
        from: "bytes",
      },
      resource: {
        kind: "scratch-file",
        name: "source.webp",
        mimeType: "image/webp",
        size: 3,
        base64: "AAAA",
      },
    });
    expect(encodeProviderFile).toHaveBeenCalledWith(expect.anything(), {
      outputMimes: ["image/png"],
    });
  });

  it.each(["null", "throw"] as const)(
    "keeps the scratch fallback when provider preparation returns %s",
    async (failure) => {
      const encodeProviderFile = vi.fn<
        InputResourceRouter.Effects["encodeProviderFile"]
      >(async () => {
        if (failure === "throw") throw new Error("provider decode failed");
        return null;
      });
      const encodeOperableFile = vi.fn<
        InputResourceRouter.Effects["encodeOperableFile"]
      >(async () => ({
        name: "original.gif",
        mime: "image/gif",
        size: 3,
        base64: "AQID",
      }));
      const result = await InputResourceRouter.prepare(
        {
          kind: "browser-file",
          id: "gif-1",
          source: "drop",
          file: file({
            name: "original.gif",
            type: "image/gif",
            bytes: [1, 2, 3],
          }),
        },
        environment({
          attachment: {
            provider: { inlineMimes: ["image/png"], remoteUrlMimes: [] },
          },
          effects: { encodeProviderFile, encodeOperableFile },
        })
      );

      expect(result).toMatchObject({
        status: "accept",
        decision: { route: { via: "provider-and-scratch" } },
        materializedRoute: { kind: "attachment", via: "scratch" },
        resource: {
          kind: "scratch-file",
          name: "original.gif",
          base64: "AQID",
        },
      });
    }
  );

  it.each(["null", "throw"] as const)(
    "keeps provider perception when scratch preparation returns %s",
    async (failure) => {
      const encodeProviderFile = vi.fn<
        InputResourceRouter.Effects["encodeProviderFile"]
      >(async () => ({
        name: "preview.png",
        mime: "image/png",
        size: 3,
        url: "data:image/png;base64,AAAA",
      }));
      const encodeOperableFile = vi.fn<
        InputResourceRouter.Effects["encodeOperableFile"]
      >(async () => {
        if (failure === "throw") throw new Error("raw read failed");
        return null;
      });
      const result = await InputResourceRouter.prepare(
        {
          kind: "browser-file",
          id: "gif-1",
          source: "drop",
          file: file({
            name: "original.gif",
            type: "image/gif",
            bytes: [1, 2, 3],
          }),
        },
        environment({
          attachment: {
            provider: { inlineMimes: ["image/png"], remoteUrlMimes: [] },
          },
          effects: { encodeProviderFile, encodeOperableFile },
        })
      );

      expect(result).toMatchObject({
        status: "accept",
        decision: { route: { via: "provider-and-scratch" } },
        materializedRoute: {
          kind: "attachment",
          via: "provider",
          from: "bytes",
        },
        resource: {
          kind: "provider-file",
          name: "preview.png",
          mimeType: "image/png",
        },
      });
    }
  );

  it("rejects an oversized scratch file before reading it", async () => {
    const encodeOperableFile =
      vi.fn<InputResourceRouter.Effects["encodeOperableFile"]>();
    const result = await InputResourceRouter.prepare(
      {
        kind: "browser-file",
        id: "large-1",
        source: "picker",
        file: file({ name: "large.zip", size: 9 * 1024 * 1024 }),
      },
      environment({ effects: { encodeOperableFile } })
    );

    expect(result).toMatchObject({
      status: "reject",
      reason: "file-too-large",
    });
    expect(encodeOperableFile).not.toHaveBeenCalled();
  });

  it("does not read file bytes when the host omits base64 scratch support", async () => {
    const encodeOperableFile =
      vi.fn<InputResourceRouter.Effects["encodeOperableFile"]>();
    const result = await InputResourceRouter.prepare(
      {
        kind: "browser-file",
        id: "old-host-1",
        source: "picker",
        file: file({ name: "brief.pdf", type: "application/pdf" }),
      },
      environment({
        attachment: { scratch: undefined },
        effects: { encodeOperableFile },
      })
    );

    expect(result).toMatchObject({
      status: "reject",
      reason: "scratch-unavailable",
    });
    expect(encodeOperableFile).not.toHaveBeenCalled();
  });

  it("rejects scratch output whose declared size differs from its bytes", async () => {
    const encodeOperableFile = vi.fn<
      InputResourceRouter.Effects["encodeOperableFile"]
    >(async () => ({
      name: "mismatch.bin",
      mime: "application/octet-stream",
      size: 1,
      base64: "AAAA",
    }));
    const result = await InputResourceRouter.prepare(
      {
        kind: "browser-file",
        id: "mismatch-1",
        source: "picker",
        file: file({ name: "mismatch.bin", size: 1 }),
      },
      environment({ effects: { encodeOperableFile } })
    );

    expect(result).toMatchObject({
      status: "reject",
      reason: "preparation-failed",
    });
  });

  it.each(["not-base64", "AB=="])(
    "rejects non-canonical scratch base64 %s",
    async (base64) => {
      const encodeOperableFile = vi.fn<
        InputResourceRouter.Effects["encodeOperableFile"]
      >(async () => ({
        name: "invalid.bin",
        mime: "application/octet-stream",
        size: 1,
        base64,
      }));
      const result = await InputResourceRouter.prepare(
        {
          kind: "browser-file",
          id: "invalid-1",
          source: "picker",
          file: file({ name: "invalid.bin", size: 1 }),
        },
        environment({ effects: { encodeOperableFile } })
      );

      expect(result).toMatchObject({
        status: "reject",
        reason: "preparation-failed",
      });
    }
  );

  it("rejects encoded scratch bytes above the per-file limit", async () => {
    const encodeOperableFile = vi.fn<
      InputResourceRouter.Effects["encodeOperableFile"]
    >(async () => ({
      name: "expanded.bin",
      mime: "application/octet-stream",
      size: 9,
      base64: "AAAAAAAAAAAA",
    }));
    const result = await InputResourceRouter.prepare(
      {
        kind: "browser-file",
        id: "expanded-1",
        source: "picker",
        file: file({ name: "expanded.bin", size: 1 }),
      },
      environment({
        attachment: {
          scratch: { maxFileBytes: 8, maxFiles: 64, maxTotalBytes: 8 },
        },
        effects: { encodeOperableFile },
      })
    );

    expect(result).toMatchObject({
      status: "reject",
      reason: "preparation-failed",
    });
  });

  it("rejects a scratch encoder that expands or truncates the source bytes", async () => {
    const encodeOperableFile = vi.fn<
      InputResourceRouter.Effects["encodeOperableFile"]
    >(async () => ({
      name: "expanded.bin",
      mime: "application/octet-stream",
      size: 2,
      base64: "AAA=",
    }));
    const result = await InputResourceRouter.prepare(
      {
        kind: "browser-file",
        id: "expanded-source-1",
        source: "picker",
        file: file({ name: "expanded.bin", size: 1 }),
      },
      environment({ effects: { encodeOperableFile } })
    );

    expect(result).toMatchObject({
      status: "reject",
      reason: "preparation-failed",
    });
  });

  it("makes Library delivery switchable without changing its source adapter", async () => {
    const input = {
      kind: "library-file",
      id: "pin-1",
      source: "library",
      name: "hero.png",
      mimeType: "image/png",
      url: "https://example.com/hero.png",
    } as const;
    const current = await InputResourceRouter.prepare(input, environment());
    const referenceFirst = await InputResourceRouter.prepare(
      input,
      environment(),
      InputResourcePolicy.REFERENCE_FIRST
    );

    expect(current).toMatchObject({
      status: "accept",
      resource: {
        kind: "provider-file",
        representation: "inline-bytes",
        url: "data:image/png;base64,AAAA",
      },
    });
    expect(referenceFirst).toMatchObject({
      status: "accept",
      resource: { kind: "url-reference" },
    });
  });

  it("mints a folder scope only after policy selects a host reference", async () => {
    const attachDirectory = vi.fn<
      NonNullable<
        InputResourceRouter.Environment["reference"]["attachDirectory"]
      >
    >(async () => directory);
    const result = await InputResourceRouter.prepare(
      {
        kind: "browser-directory",
        id: "drop-1",
        source: "drop",
        directory: file({ name: "references" }),
      },
      environment({ reference: { attachDirectory } })
    );

    expect(result).toMatchObject({
      status: "accept",
      resource: {
        kind: "directory-reference",
        ref: directory,
      },
    });
    expect(attachDirectory).toHaveBeenCalledOnce();
  });

  it("rejects a folder before host acquisition when no adapter exists", async () => {
    const result = await InputResourceRouter.prepare(
      {
        kind: "browser-directory",
        id: "drop-1",
        source: "drop",
        directory: file({ name: "references" }),
      },
      environment({ reference: { attachDirectory: undefined } })
    );

    expect(result).toMatchObject({
      status: "reject",
      reason: "reference-capability-unavailable",
    });
  });

  it("rejects a malformed host directory descriptor during preparation", async () => {
    const malformed = {
      ...directory,
      path: "/Users/alice/references",
    } as unknown as DirectoryScopeDescriptor;
    const result = await InputResourceRouter.prepare(
      {
        kind: "browser-directory",
        id: "drop-1",
        source: "drop",
        directory: file({ name: "references" }),
      },
      environment({ reference: { attachDirectory: async () => malformed } })
    );

    expect(result).toMatchObject({
      status: "reject",
      reason: "directory-reference-failed",
    });
  });

  it("bounds raw draft twins independently of final scratch capacity", async () => {
    const encodeProviderFile = vi.fn<
      InputResourceRouter.Effects["encodeProviderFile"]
    >(async (source) => ({
      name: source.name,
      mime: source.type,
      size: 3,
      url: `data:${source.type};base64,AAAA`,
    }));
    const encodeOperableFile = vi.fn<
      InputResourceRouter.Effects["encodeOperableFile"]
    >(async (source) => ({
      name: source.name,
      mime: source.type,
      size: source.size,
      base64: "AQIDBAU=",
    }));
    const results = await InputResourceRouter.prepareBatch(
      ["one", "two"].map(
        (name) =>
          ({
            kind: "browser-file",
            id: name,
            source: "drop",
            file: file({
              name: `${name}.png`,
              type: "image/png",
              bytes: [1, 2, 3, 4, 5],
            }),
          }) as const
      ),
      environment({
        attachment: {
          operableTwinRetention: { maxFiles: 64, maxTotalBytes: 8 },
        },
        effects: { encodeProviderFile, encodeOperableFile },
      })
    );

    expect(results).toMatchObject([
      {
        status: "accept",
        decision: { route: { via: "provider-and-scratch" } },
        resource: { kind: "provider-and-scratch-file" },
      },
      {
        status: "accept",
        decision: {
          route: { via: "provider" },
          trace: [
            {
              preference: "provider-and-scratch-bytes-attachment",
              available: false,
              reason: "draft-operable-copy-budget-exceeded",
            },
            { preference: "provider-bytes-attachment", available: true },
          ],
        },
        materializedRoute: { via: "provider" },
        resource: { kind: "provider-file" },
      },
    ]);
    expect(encodeProviderFile).toHaveBeenCalledTimes(2);
    expect(encodeOperableFile).toHaveBeenCalledOnce();
  });

  it("retains admitted raster twins until final lowering can allocate current capacity", async () => {
    const encodeProviderFile = vi.fn<
      InputResourceRouter.Effects["encodeProviderFile"]
    >(async (source) => ({
      name: source.name,
      mime: source.type,
      size: 3,
      url: `data:${source.type};base64,AAAA`,
    }));
    const encodeOperableFile = vi.fn<
      InputResourceRouter.Effects["encodeOperableFile"]
    >(async (source) => ({
      name: source.name,
      mime: source.type,
      size: source.size,
      base64: "AQIDBAU=",
    }));
    const results = await InputResourceRouter.prepareBatch(
      ["one", "two"].map(
        (name) =>
          ({
            kind: "browser-file",
            id: name,
            source: "drop",
            file: file({
              name: `${name}.png`,
              type: "image/png",
              bytes: [1, 2, 3, 4, 5],
            }),
          }) as const
      ),
      environment({
        attachment: {
          scratch: { maxFileBytes: 8, maxFiles: 64, maxTotalBytes: 8 },
        },
        effects: { encodeProviderFile, encodeOperableFile },
      })
    );

    expect(results).toMatchObject([
      {
        status: "accept",
        decision: { route: { via: "provider-and-scratch" } },
        resource: { kind: "provider-and-scratch-file", base64: "AQIDBAU=" },
      },
      {
        status: "accept",
        decision: { route: { via: "provider-and-scratch" } },
        resource: { kind: "provider-and-scratch-file", base64: "AQIDBAU=" },
      },
    ]);
    expect(encodeProviderFile).toHaveBeenCalledTimes(2);
    expect(encodeOperableFile).toHaveBeenCalledTimes(2);

    const bound = results.flatMap((result) =>
      result.status === "accept"
        ? [
            {
              attachmentId: result.resource.sourceId,
              resource: result.resource,
            },
          ]
        : []
    );
    const both = InputResourceRouter.lower(bound, {
      provider: provider(["image/png"]),
      scratch: { maxFileBytes: 8, maxFiles: 64, maxTotalBytes: 8 },
    });
    expect(both.files).toHaveLength(2);
    expect(both.extras).toMatchObject({
      scratchSeed: [{ path: "upload-one-one.png", base64: "AQIDBAU=" }],
      contexts: [
        {
          type: USER_FILE_ATTACHMENTS,
          data: {
            files: [{ name: "one.png", provider_file_index: 0 }],
          },
        },
      ],
    });
    expect(both.rejected).toEqual([]);
    expect(both.routes).toMatchObject([
      {
        attachmentId: "one",
        route: { via: "provider-and-scratch" },
      },
      {
        attachmentId: "two",
        route: { via: "provider" },
      },
    ]);

    // Capacity is a submit-time fact. Removing the first attachment lets the
    // retained raw twin of the second image become operable immediately.
    const afterRemoval = InputResourceRouter.lower(bound.slice(1), {
      provider: provider(["image/png"]),
      scratch: { maxFileBytes: 8, maxFiles: 64, maxTotalBytes: 8 },
    });
    expect(afterRemoval.extras).toMatchObject({
      scratchSeed: [{ path: "upload-two-two.png", base64: "AQIDBAU=" }],
      contexts: [
        {
          type: USER_FILE_ATTACHMENTS,
          data: {
            files: [{ name: "two.png", provider_file_index: 0 }],
          },
        },
      ],
    });
    expect(afterRemoval.routes).toMatchObject([
      {
        attachmentId: "two",
        route: { via: "provider-and-scratch" },
      },
    ]);
  });

  it("allocates mandatory scratch-only files before optional raster twins", async () => {
    const encodeProviderFile = vi.fn<
      InputResourceRouter.Effects["encodeProviderFile"]
    >(async (source) => ({
      name: source.name,
      mime: source.type,
      size: 3,
      url: `data:${source.type};base64,AAAA`,
    }));
    const encodeOperableFile = vi.fn<
      InputResourceRouter.Effects["encodeOperableFile"]
    >(async (source) => ({
      name: source.name,
      mime: source.type || "application/octet-stream",
      size: source.size,
      base64: "AQIDBAU=",
    }));
    const results = await InputResourceRouter.prepareBatch(
      [
        {
          kind: "browser-file",
          id: "image",
          source: "drop",
          file: file({
            name: "image.png",
            type: "image/png",
            bytes: [1, 2, 3, 4, 5],
          }),
        },
        {
          kind: "browser-file",
          id: "archive",
          source: "drop",
          file: file({
            name: "archive.zip",
            type: "application/zip",
            bytes: [1, 2, 3, 4, 5],
          }),
        },
      ],
      environment({
        attachment: {
          scratch: { maxFileBytes: 8, maxFiles: 64, maxTotalBytes: 8 },
        },
        effects: { encodeProviderFile, encodeOperableFile },
      })
    );

    expect(results).toMatchObject([
      {
        status: "accept",
        decision: { route: { via: "provider-and-scratch" } },
        resource: { kind: "provider-and-scratch-file" },
      },
      {
        status: "accept",
        decision: { route: { via: "scratch" } },
        resource: { kind: "scratch-file", base64: "AQIDBAU=" },
      },
    ]);
    expect(encodeProviderFile).toHaveBeenCalledOnce();
    expect(encodeOperableFile).toHaveBeenCalledTimes(2);
    expect(encodeOperableFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "archive.zip" }),
      { maxBytes: 8 }
    );

    const bound = results.flatMap((result) =>
      result.status === "accept"
        ? [
            {
              attachmentId: result.resource.sourceId,
              resource: result.resource,
            },
          ]
        : []
    );
    const lowered = InputResourceRouter.lower(bound, {
      provider: provider(["image/png"]),
      scratch: { maxFileBytes: 8, maxFiles: 64, maxTotalBytes: 8 },
    });
    expect(lowered.files).toHaveLength(1);
    expect(lowered.extras).toMatchObject({
      scratchSeed: [{ path: "upload-archive-archive.zip", base64: "AQIDBAU=" }],
      contexts: [
        {
          type: USER_FILE_ATTACHMENTS,
          data: { files: [{ name: "archive.zip" }] },
        },
      ],
    });
    expect(lowered.rejected).toEqual([]);
    expect(lowered.routes).toMatchObject([
      { attachmentId: "image", route: { via: "provider" } },
      { attachmentId: "archive", route: { via: "scratch" } },
    ]);
  });

  it("rejects an over-budget scratch batch before reading any bytes", async () => {
    const encodeOperableFile =
      vi.fn<InputResourceRouter.Effects["encodeOperableFile"]>();
    const results = await InputResourceRouter.prepareBatch(
      [
        {
          kind: "browser-file",
          id: "one",
          source: "drop",
          file: file({ name: "one.bin", size: 5 }),
        },
        {
          kind: "browser-file",
          id: "two",
          source: "drop",
          file: file({ name: "two.bin", size: 5 }),
        },
      ],
      environment({
        attachment: {
          scratch: { maxFileBytes: 8, maxFiles: 64, maxTotalBytes: 8 },
        },
        effects: { encodeOperableFile },
      })
    );

    expect(results).toMatchObject([
      { status: "reject", reason: "scratch-budget-exceeded" },
      { status: "reject", reason: "scratch-budget-exceeded" },
    ]);
    expect(encodeOperableFile).not.toHaveBeenCalled();
  });

  it("includes existing resources and reserved template seeds in preflight", async () => {
    const encodeOperableFile =
      vi.fn<InputResourceRouter.Effects["encodeOperableFile"]>();
    const results = await InputResourceRouter.prepareBatch(
      [
        {
          kind: "browser-file",
          id: "incoming",
          source: "picker",
          file: file({ name: "incoming.bin", size: 3 }),
        },
      ],
      environment({
        attachment: {
          scratch: {
            maxFileBytes: 8,
            maxFiles: 64,
            maxTotalBytes: 8,
            reservation: {
              fileCount: 1,
              totalBytes: 3,
              paths: ["template.canvas"],
            },
          },
        },
        effects: { encodeOperableFile },
      }),
      InputResourcePolicy.CURRENT,
      [
        {
          kind: "scratch-file",
          source: "drop",
          sourceId: "existing",
          name: "existing.bin",
          mimeType: "application/octet-stream",
          size: 3,
          base64: "AAAA",
        },
      ]
    );

    expect(results).toMatchObject([
      { status: "reject", reason: "scratch-budget-exceeded" },
    ]);
    expect(encodeOperableFile).not.toHaveBeenCalled();
  });
});

describe("InputResourceRouter.card", () => {
  it("keeps scratch bytes out of the generic composer card", () => {
    const card = InputResourceRouter.card({
      kind: "scratch-file",
      source: "picker",
      sourceId: "file-1",
      name: "brief.pdf",
      mimeType: "application/pdf",
      size: 3,
      base64: "AAAA",
    });

    expect(card).toEqual({
      kind: "file",
      id: "file-1",
      name: "brief.pdf",
      mime: "application/pdf",
      size: 3,
    });
    expect(card).not.toHaveProperty("payload");
  });

  it("shows one preview card for a dual-delivery image without exposing bytes", () => {
    const card = InputResourceRouter.card({
      kind: "provider-and-scratch-file",
      source: "paste",
      sourceId: "paste-1",
      name: "original.gif",
      mimeType: "image/gif",
      size: 5,
      base64: "AQIDBAU=",
      provider: {
        name: "original.png",
        mimeType: "image/png",
        size: 3,
        url: "data:image/png;base64,AAAA",
        representation: "inline-bytes",
      },
    });

    expect(card).toEqual({
      kind: "file",
      id: "paste-1",
      name: "original.gif",
      mime: "image/gif",
      size: 5,
      url: "data:image/png;base64,AAAA",
    });
    expect(card).not.toHaveProperty("base64");
  });
});

describe("InputResourceRouter.lower", () => {
  it("lowers explicit prepared variants without inspecting card fields", () => {
    const lowered = InputResourceRouter.lower(
      [
        {
          attachmentId: "image-1",
          resource: {
            kind: "provider-and-scratch-file",
            source: "paste",
            sourceId: "paste-1",
            name: "original.gif",
            mimeType: "image/gif",
            size: 5,
            base64: "AQIDBAU=",
            provider: {
              name: "original.png",
              mimeType: "image/png",
              size: 3,
              url: "data:image/png;base64,AAAA",
              representation: "inline-bytes",
            },
          },
        },
        {
          attachmentId: "file-1",
          resource: {
            kind: "scratch-file",
            source: "drop",
            sourceId: "drop-1",
            name: "brief.pdf",
            mimeType: "application/pdf",
            size: 3,
            base64: "AAAA",
          },
        },
        {
          attachmentId: "directory-1",
          resource: {
            kind: "directory-reference",
            source: "drop",
            sourceId: "drop-2",
            name: "references",
            ref: directory,
          },
        },
        {
          attachmentId: "url-1",
          resource: {
            kind: "url-reference",
            source: "library",
            sourceId: "pin-2",
            name: "inspiration.png",
            mimeType: "image/png",
            url: "https://example.com/inspiration.png",
          },
        },
      ],
      {
        provider: provider(["image/png"]),
        scratch: {
          maxFileBytes: 8 * 1024 * 1024,
          maxFiles: 64,
          maxTotalBytes: 8 * 1024 * 1024,
        },
      }
    );

    expect(lowered.files).toEqual([
      {
        type: "file",
        url: "data:image/png;base64,AAAA",
        mediaType: "image/png",
        filename: "original.png",
      },
    ]);
    expect(lowered.references).toEqual([
      {
        kind: "url",
        name: "inspiration.png",
        url: "https://example.com/inspiration.png",
      },
    ]);
    expect(lowered.extras).toMatchObject({
      scratchSeed: [
        { path: "upload-image-1-original.gif", base64: "AQIDBAU=" },
        { path: "upload-file-1-brief.pdf", base64: "AAAA" },
      ],
      contexts: [
        {
          type: USER_FILE_ATTACHMENTS,
          data: {
            location: "scratch",
            files: [
              {
                name: "original.gif",
                mime: "image/gif",
                size: 5,
                path: "upload-image-1-original.gif",
                provider_file_index: 0,
              },
              {
                name: "brief.pdf",
                mime: "application/pdf",
                size: 3,
                path: "upload-file-1-brief.pdf",
              },
            ],
          },
        },
        { type: USER_DIRECTORY_REFERENCES },
      ],
    });
    expect(lowered.rejected).toEqual([]);
  });

  it("correlates same-named scratch twins to exact provider file indices", () => {
    const dual = (
      attachmentId: string,
      sourceId: string,
      providerName: string,
      base64: string
    ): InputResourceRouter.BoundResource => ({
      attachmentId,
      resource: {
        kind: "provider-and-scratch-file",
        source: "drop",
        sourceId,
        name: "duplicate.gif",
        mimeType: "image/gif",
        size: 3,
        base64,
        provider: {
          name: providerName,
          mimeType: "image/png",
          size: 3,
          url: "data:image/png;base64,AAAA",
          representation: "inline-bytes",
        },
      },
    });
    const lowered = InputResourceRouter.lower(
      [
        {
          attachmentId: "preview-only",
          resource: {
            kind: "provider-file",
            source: "library",
            sourceId: "library-1",
            name: "duplicate.gif",
            mimeType: "image/png",
            size: 3,
            url: "data:image/png;base64,AAAA",
            representation: "inline-bytes",
          },
        },
        dual("dual-a", "drop-a", "preview-a.png", "AQID"),
        dual("dual-b", "drop-b", "preview-b.png", "BAUG"),
        {
          attachmentId: "notes",
          resource: {
            kind: "scratch-file",
            source: "drop",
            sourceId: "drop-notes",
            name: "duplicate.gif",
            mimeType: "application/octet-stream",
            size: 3,
            base64: "BwgJ",
          },
        },
      ],
      {
        provider: provider(["image/png"]),
        scratch: { maxFileBytes: 8, maxFiles: 8, maxTotalBytes: 16 },
      }
    );

    expect(lowered.files.map((part) => part.filename)).toEqual([
      "duplicate.gif",
      "preview-a.png",
      "preview-b.png",
    ]);
    expect(lowered.extras).toMatchObject({
      contexts: [
        {
          type: USER_FILE_ATTACHMENTS,
          data: {
            files: [
              { path: "upload-dual-a-duplicate.gif", provider_file_index: 1 },
              { path: "upload-dual-b-duplicate.gif", provider_file_index: 2 },
              { path: "upload-notes-duplicate.gif" },
            ],
          },
        },
      ],
    });
  });

  it("rejects a provider file if the active model changed", () => {
    const lowered = InputResourceRouter.lower(
      [
        {
          attachmentId: "image-1",
          resource: {
            kind: "provider-file",
            source: "paste",
            sourceId: "paste-1",
            name: "paste.png",
            mimeType: "image/png",
            url: "data:image/png;base64,AAAA",
            representation: "inline-bytes",
          },
        },
      ],
      { provider: provider() }
    );

    expect(lowered.files).toEqual([]);
    expect(lowered.rejected).toEqual([
      {
        attachmentId: "image-1",
        reason: "provider-capability-unavailable",
      },
    ]);
  });

  it("keeps a dual image operable when the active model loses vision support", () => {
    const lowered = InputResourceRouter.lower(
      [
        {
          attachmentId: "image-1",
          resource: {
            kind: "provider-and-scratch-file",
            source: "paste",
            sourceId: "paste-1",
            name: "paste.png",
            mimeType: "image/png",
            size: 3,
            base64: "AQID",
            provider: {
              name: "paste.png",
              mimeType: "image/png",
              size: 3,
              url: "data:image/png;base64,AAAA",
              representation: "inline-bytes",
            },
          },
        },
      ],
      {
        provider: provider(),
        scratch: { maxFileBytes: 8, maxFiles: 1, maxTotalBytes: 8 },
      }
    );

    expect(lowered.files).toEqual([]);
    expect(lowered.extras).toMatchObject({
      scratchSeed: [{ path: "upload-image-1-paste.png", base64: "AQID" }],
      contexts: [{ type: USER_FILE_ATTACHMENTS }],
    });
    expect(lowered.rejected).toEqual([]);
  });

  it("reserves scratch for a provider-failed twin before optional twins", () => {
    const dual = (
      attachmentId: string,
      providerMime: string,
      base64: string
    ): InputResourceRouter.BoundResource => ({
      attachmentId,
      resource: {
        kind: "provider-and-scratch-file",
        source: "drop",
        sourceId: attachmentId,
        name: `${attachmentId}.gif`,
        mimeType: "image/gif",
        size: 3,
        base64,
        provider: {
          name: `${attachmentId}.preview`,
          mimeType: providerMime,
          size: 3,
          url: `data:${providerMime};base64,AAAA`,
          representation: "inline-bytes",
        },
      },
    });
    const lowered = InputResourceRouter.lower(
      [
        dual("provider-ok", "image/png", "AQID"),
        dual("scratch-required", "image/jpeg", "BAUG"),
      ],
      {
        provider: provider(["image/png"]),
        scratch: { maxFileBytes: 3, maxFiles: 1, maxTotalBytes: 3 },
      }
    );

    expect(lowered.files.map((part) => part.filename)).toEqual([
      "provider-ok.preview",
    ]);
    expect(lowered.extras).toMatchObject({
      scratchSeed: [
        {
          path: "upload-scratch-required-scratch-required.gif",
          base64: "BAUG",
        },
      ],
      contexts: [
        {
          type: USER_FILE_ATTACHMENTS,
          data: {
            files: [
              {
                name: "scratch-required.gif",
                path: "upload-scratch-required-scratch-required.gif",
              },
            ],
          },
        },
      ],
    });
    expect(lowered.routes).toMatchObject([
      { attachmentId: "provider-ok", route: { via: "provider" } },
      { attachmentId: "scratch-required", route: { via: "scratch" } },
    ]);
    expect(lowered.rejected).toEqual([]);
  });

  it("keeps provider perception when a dual image loses scratch support", () => {
    const lowered = InputResourceRouter.lower(
      [
        {
          attachmentId: "image-1",
          resource: {
            kind: "provider-and-scratch-file",
            source: "drop",
            sourceId: "drop-1",
            name: "original.gif",
            mimeType: "image/gif",
            size: 5,
            base64: "AQIDBAU=",
            provider: {
              name: "preview.png",
              mimeType: "image/png",
              size: 3,
              url: "data:image/png;base64,AAAA",
              representation: "inline-bytes",
            },
          },
        },
      ],
      { provider: provider(["image/png"]) }
    );

    expect(lowered.files).toEqual([
      {
        type: "file",
        url: "data:image/png;base64,AAAA",
        mediaType: "image/png",
        filename: "preview.png",
      },
    ]);
    expect(lowered.extras).toBeUndefined();
    expect(lowered.rejected).toEqual([]);
  });

  it("rejects an already-prepared scratch file when the host capability is absent", () => {
    const lowered = InputResourceRouter.lower(
      [
        {
          attachmentId: "file-1",
          resource: {
            kind: "scratch-file",
            source: "drop",
            sourceId: "drop-1",
            name: "brief.pdf",
            mimeType: "application/pdf",
            size: 3,
            base64: "AAAA",
          },
        },
      ],
      { provider: provider() }
    );

    expect(lowered.extras).toBeUndefined();
    expect(lowered.rejected).toEqual([
      {
        attachmentId: "file-1",
        reason: "scratch-unavailable",
      },
    ]);
  });

  it("rechecks inline versus remote-URL capability when lowering", () => {
    const remote: InputResourceRouter.BoundResource = {
      attachmentId: "remote-1",
      resource: {
        kind: "provider-file",
        source: "library",
        sourceId: "pin-1",
        name: "remote.png",
        mimeType: "image/png",
        url: "https://example.com/remote.png",
        representation: "remote-url",
      },
    };

    expect(
      InputResourceRouter.lower([remote], {
        provider: provider(["image/png"]),
      })
    ).toMatchObject({
      files: [],
      rejected: [
        {
          attachmentId: "remote-1",
          reason: "provider-capability-unavailable",
        },
      ],
    });
    expect(
      InputResourceRouter.lower([remote], {
        provider: provider([], ["image/png"]),
      }).files
    ).toEqual([
      {
        type: "file",
        url: "https://example.com/remote.png",
        mediaType: "image/png",
        filename: "remote.png",
      },
    ]);
  });

  it("atomically rejects scratch files above the aggregate byte budget", () => {
    const resources: InputResourceRouter.BoundResource[] = ["one", "two"].map(
      (name) => ({
        attachmentId: name,
        resource: {
          kind: "scratch-file",
          source: "picker",
          sourceId: name,
          name: `${name}.bin`,
          mimeType: "application/octet-stream",
          size: 5,
          base64: "AAAA",
        },
      })
    );
    const lowered = InputResourceRouter.lower(resources, {
      provider: provider(),
      scratch: { maxFileBytes: 8, maxFiles: 64, maxTotalBytes: 8 },
    });

    expect(lowered.extras).toBeUndefined();
    expect(lowered.rejected).toEqual([
      { attachmentId: "one", reason: "scratch-budget-exceeded" },
      { attachmentId: "two", reason: "scratch-budget-exceeded" },
    ]);
  });

  it("atomically rejects scratch files above the file-count budget", () => {
    const resources: InputResourceRouter.BoundResource[] = ["one", "two"].map(
      (name) => ({
        attachmentId: name,
        resource: {
          kind: "scratch-file",
          source: "picker",
          sourceId: name,
          name: `${name}.txt`,
          mimeType: "text/plain",
          size: 1,
          base64: "AA==",
        },
      })
    );
    const lowered = InputResourceRouter.lower(resources, {
      provider: provider(),
      scratch: { maxFileBytes: 8, maxFiles: 1, maxTotalBytes: 8 },
    });

    expect(lowered.extras).toBeUndefined();
    expect(lowered.rejected).toEqual([
      { attachmentId: "one", reason: "scratch-file-count-exceeded" },
      { attachmentId: "two", reason: "scratch-file-count-exceeded" },
    ]);
  });

  it("reserves merged seed paths and capacity during final lowering", () => {
    const lowered = InputResourceRouter.lower(
      [
        {
          attachmentId: "file-1",
          resource: {
            kind: "scratch-file",
            source: "picker",
            sourceId: "file-1",
            name: "brief.pdf",
            mimeType: "application/pdf",
            size: 1,
            base64: "AA==",
          },
        },
      ],
      {
        provider: provider(),
        scratch: {
          maxFileBytes: 8,
          maxFiles: 2,
          maxTotalBytes: 8,
          reservation: {
            fileCount: 1,
            totalBytes: 1,
            paths: ["upload-file-1-brief.pdf"],
          },
        },
      }
    );

    expect(lowered.extras?.scratchSeed).toEqual([
      { path: "upload-file-1-brief-2.pdf", base64: "AA==" },
    ]);
    expect(lowered.rejected).toEqual([]);
  });

  it("preserves identical path strings in distinct reference spaces", () => {
    const make = (
      attachmentId: string,
      space: "workspace" | "reference"
    ): InputResourceRouter.BoundResource => ({
      attachmentId,
      resource: {
        kind: "path-reference",
        source: "workspace",
        sourceId: attachmentId,
        name: "notes.md",
        path: "notes.md",
        space,
      },
    });
    const lowered = InputResourceRouter.lower(
      [make("workspace", "workspace"), make("reference", "reference")],
      { provider: provider() }
    );

    expect(lowered.references).toEqual([
      {
        kind: "path",
        name: "notes.md",
        path: "notes.md",
        space: "workspace",
      },
      {
        kind: "path",
        name: "notes.md",
        path: "notes.md",
        space: "reference",
      },
    ]);
  });
});

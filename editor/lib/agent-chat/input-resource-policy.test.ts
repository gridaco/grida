import { describe, expect, it } from "vitest";
import { InputResourcePolicy } from "./input-resource-policy";

const capable: InputResourcePolicy.Capabilities = {
  reference: {
    path: true,
    url: true,
    hostScope: { file: false, directory: true },
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
  },
};

function resource(
  input: Partial<InputResourcePolicy.ResourceFacts> &
    Pick<InputResourcePolicy.ResourceFacts, "id" | "name">
): InputResourcePolicy.ResourceFacts {
  return {
    kind: "file",
    source: "drop",
    media: "other",
    available: {},
    ...input,
  };
}

function providerBytes(...outputMimes: string[]) {
  return { bytes: true as const, provider: { fromBytes: { outputMimes } } };
}

function providerUrl(mimeType: string) {
  return {
    url: true as const,
    provider: {
      fromUrl: {
        inlineOutputMimes: [mimeType, "image/png", "image/jpeg"],
        remoteMime: mimeType,
      },
    },
  };
}

describe("InputResourcePolicy.CURRENT", () => {
  it.each([
    {
      name: "workspace path",
      resource: resource({
        id: "workspace",
        name: "a.ts",
        source: "workspace",
        available: { path: { space: "workspace" } },
      }),
      route: { kind: "reference", via: "path", space: "workspace" },
      ruleId: "existing-path",
    },
    {
      name: "directory drop",
      resource: resource({
        id: "folder",
        name: "references",
        kind: "directory",
        available: { hostScope: { resource: "directory" } },
      }),
      route: {
        kind: "reference",
        via: "host-scope",
        resource: "directory",
      },
      ruleId: "directory",
    },
    {
      name: "Library image URL",
      resource: resource({
        id: "library",
        name: "hero.png",
        source: "library",
        media: "raster-image",
        mimeType: "image/png",
        available: providerUrl("image/png"),
      }),
      route: {
        kind: "attachment",
        via: "provider",
        from: "url",
        representation: "inline-bytes",
      },
      ruleId: "url-image",
    },
    {
      name: "pasted image bytes",
      resource: resource({
        id: "paste-image",
        name: "paste.png",
        source: "paste",
        media: "raster-image",
        mimeType: "image/png",
        available: providerBytes("image/png", "image/jpeg"),
      }),
      route: {
        kind: "attachment",
        via: "provider-and-scratch",
        from: "bytes",
        representation: "inline-bytes",
      },
      ruleId: "byte-image",
    },
    {
      name: "generic file bytes",
      resource: resource({
        id: "pdf",
        name: "brief.pdf",
        mimeType: "application/pdf",
        size: 1024,
        available: { bytes: true },
      }),
      route: { kind: "attachment", via: "scratch", from: "bytes" },
      ruleId: "byte-file",
    },
  ])("routes $name", ({ resource, route, ruleId }) => {
    const decision = InputResourcePolicy.decide(resource, capable);
    expect(decision.status).toBe("accept");
    if (decision.status !== "accept") return;
    expect(decision.ruleId).toBe(ruleId);
    expect(decision.route).toEqual(route);
  });

  it("keeps image bytes operable when the model cannot perceive their MIME", () => {
    const decision = InputResourcePolicy.decide(
      resource({
        id: "image",
        name: "image.png",
        media: "raster-image",
        mimeType: "image/png",
        available: providerBytes("image/png"),
      }),
      {
        ...capable,
        attachment: {
          ...capable.attachment,
          provider: { ...capable.attachment.provider, inlineMimes: [] },
        },
      }
    );
    expect(decision).toMatchObject({
      status: "accept",
      ruleId: "byte-image",
      route: { kind: "attachment", via: "scratch", from: "bytes" },
      trace: [
        {
          preference: "provider-and-scratch-bytes-attachment",
          available: false,
          reason: "provider-capability-unavailable",
        },
        {
          preference: "provider-bytes-attachment",
          available: false,
          reason: "provider-capability-unavailable",
        },
        { preference: "scratch-attachment", available: true },
      ],
    });
  });

  it.each([
    { name: "notes.txt", mimeType: "text/plain", media: "other" as const },
    {
      name: "diagram.svg",
      mimeType: "image/svg+xml",
      media: "other" as const,
    },
    {
      name: "photo.png",
      mimeType: "image/png",
      media: "raster-image" as const,
    },
  ])(
    "keeps $name scratch-operable without binary command tools",
    ({ name, mimeType, media }) => {
      const decision = InputResourcePolicy.decide(
        resource({
          id: name,
          name,
          mimeType,
          media,
          available:
            media === "raster-image"
              ? providerBytes("image/png")
              : { bytes: true },
        }),
        {
          ...capable,
          attachment: {
            provider: {
              ...capable.attachment.provider,
              inlineMimes: [],
            },
            scratch: {
              ...capable.attachment.scratch!,
              binaryTools: false,
            },
          },
        }
      );

      expect(decision).toMatchObject({
        status: "accept",
        route: { kind: "attachment", via: "scratch", from: "bytes" },
      });
    }
  );

  it("rejects an inert binary scratch-only file without binary command tools", () => {
    const decision = InputResourcePolicy.decide(
      resource({
        id: "archive",
        name: "archive.zip",
        mimeType: "application/zip",
        available: { bytes: true },
      }),
      {
        ...capable,
        attachment: {
          ...capable.attachment,
          scratch: {
            ...capable.attachment.scratch!,
            binaryTools: false,
          },
        },
      }
    );

    expect(decision).toMatchObject({
      status: "reject",
      reason: "scratch-binary-tools-required",
    });
  });

  it.each([
    { name: "segment.ts", mimeType: undefined },
    { name: "segment.ts", mimeType: "video/mp2t" },
  ])(
    "does not infer TypeScript text safety from $name with MIME $mimeType",
    ({ name, mimeType }) => {
      const decision = InputResourcePolicy.decide(
        resource({
          id: mimeType ?? "bare-ts",
          name,
          mimeType,
          available: { bytes: true },
        }),
        {
          ...capable,
          attachment: {
            ...capable.attachment,
            scratch: {
              ...capable.attachment.scratch!,
              binaryTools: false,
            },
          },
        }
      );

      expect(decision).toMatchObject({
        status: "reject",
        reason: "scratch-binary-tools-required",
      });
    }
  );

  it("accepts .ts as structured text with an explicit TypeScript MIME", () => {
    const decision = InputResourcePolicy.decide(
      resource({
        id: "typescript",
        name: "source.ts",
        mimeType: "application/typescript",
        available: { bytes: true },
      }),
      {
        ...capable,
        attachment: {
          ...capable.attachment,
          scratch: {
            ...capable.attachment.scratch!,
            binaryTools: false,
          },
        },
      }
    );

    expect(decision).toMatchObject({
      status: "accept",
      route: { kind: "attachment", via: "scratch", from: "bytes" },
    });
  });

  it("falls back to provider-only image delivery without session scratch", () => {
    const decision = InputResourcePolicy.decide(
      resource({
        id: "image",
        name: "image.png",
        media: "raster-image",
        mimeType: "image/png",
        available: providerBytes("image/png"),
      }),
      {
        ...capable,
        attachment: { provider: capable.attachment.provider },
      }
    );
    expect(decision).toMatchObject({
      status: "accept",
      ruleId: "byte-image",
      route: {
        kind: "attachment",
        via: "provider",
        from: "bytes",
        representation: "inline-bytes",
      },
      trace: [
        {
          preference: "provider-and-scratch-bytes-attachment",
          available: false,
          reason: "scratch-unavailable",
        },
        { preference: "provider-bytes-attachment", available: true },
      ],
    });
  });

  it("falls back to provider-only image delivery above the scratch file cap", () => {
    const decision = InputResourcePolicy.decide(
      resource({
        id: "large-image",
        name: "large.png",
        media: "raster-image",
        mimeType: "image/png",
        size: 9 * 1024 * 1024,
        available: providerBytes("image/png"),
      }),
      capable
    );
    expect(decision).toMatchObject({
      status: "accept",
      route: { kind: "attachment", via: "provider", from: "bytes" },
      trace: [
        {
          preference: "provider-and-scratch-bytes-attachment",
          available: false,
          reason: "file-too-large",
        },
        { preference: "provider-bytes-attachment", available: true },
      ],
    });
  });

  it("does not treat inline MIME support as remote-URL fetch support", () => {
    const input = resource({
      id: "remote-only",
      name: "remote.png",
      source: "library",
      media: "raster-image",
      mimeType: "image/png",
      available: {
        url: true,
        provider: { fromUrl: { remoteMime: "image/png" } },
      },
    });

    expect(InputResourcePolicy.decide(input, capable)).toMatchObject({
      status: "reject",
      reason: "provider-capability-unavailable",
    });
    expect(
      InputResourcePolicy.decide(input, {
        ...capable,
        attachment: {
          ...capable.attachment,
          provider: {
            ...capable.attachment.provider,
            remoteUrlMimes: ["image/png"],
          },
        },
      })
    ).toMatchObject({
      status: "accept",
      route: {
        from: "url",
        representation: "remote-url",
      },
    });
  });

  it("checks encoder output MIME rather than the source MIME", () => {
    const input = resource({
      id: "webp",
      name: "source.webp",
      media: "raster-image",
      mimeType: "image/webp",
      available: providerBytes("image/webp", "image/png"),
    });
    const providerOnly: InputResourcePolicy.Config = {
      id: "provider-only",
      rules: [
        {
          id: "bytes",
          when: () => true,
          prefer: ["provider-bytes-attachment"],
        },
      ],
    };
    expect(
      InputResourcePolicy.decide(
        input,
        {
          ...capable,
          attachment: {
            provider: {
              ...capable.attachment.provider,
              inlineMimes: ["image/png"],
            },
          },
        },
        providerOnly
      )
    ).toMatchObject({
      status: "accept",
      route: { kind: "attachment", via: "provider", from: "bytes" },
    });
    expect(
      InputResourcePolicy.decide(
        { ...input, available: providerBytes("image/webp") },
        {
          ...capable,
          attachment: {
            provider: {
              ...capable.attachment.provider,
              inlineMimes: ["image/png"],
            },
          },
        },
        providerOnly
      )
    ).toMatchObject({
      status: "reject",
      reason: "provider-capability-unavailable",
    });
  });

  it("does not silently reinterpret an unsupported Library item as a reference", () => {
    const decision = InputResourcePolicy.decide(
      resource({
        id: "library-svg",
        name: "hero.svg",
        source: "library",
        media: "other",
        mimeType: "image/svg+xml",
        available: { url: true },
      }),
      capable
    );
    expect(decision).toMatchObject({
      status: "reject",
      ruleId: "no-match",
      reason: "representation-unavailable",
    });
  });

  it("rejects an oversized scratch file before reading its bytes", () => {
    const decision = InputResourcePolicy.decide(
      resource({
        id: "large",
        name: "large.zip",
        size: 9 * 1024 * 1024,
        available: { bytes: true },
      }),
      capable
    );
    expect(decision).toMatchObject({
      status: "reject",
      reason: "file-too-large",
    });
  });
});

describe("InputResourcePolicy.REFERENCE_FIRST", () => {
  it("changes a Library URL from provider delivery to a live URL reference", () => {
    const input = resource({
      id: "library",
      name: "hero.png",
      source: "library",
      media: "raster-image",
      mimeType: "image/png",
      available: providerUrl("image/png"),
    });
    const current = InputResourcePolicy.decide(
      input,
      capable,
      InputResourcePolicy.CURRENT
    );
    const referenceFirst = InputResourcePolicy.decide(
      input,
      capable,
      InputResourcePolicy.REFERENCE_FIRST
    );
    expect(current).toMatchObject({
      status: "accept",
      route: { kind: "attachment", via: "provider" },
    });
    expect(referenceFirst).toMatchObject({
      status: "accept",
      route: { kind: "reference", via: "url" },
    });
  });

  it("keeps bytes-only paste as an attachment because no reference exists", () => {
    const decision = InputResourcePolicy.decide(
      resource({
        id: "paste",
        name: "paste.png",
        source: "paste",
        media: "raster-image",
        mimeType: "image/png",
        available: providerBytes("image/png"),
      }),
      capable,
      InputResourcePolicy.REFERENCE_FIRST
    );
    expect(decision).toMatchObject({
      status: "accept",
      route: {
        kind: "attachment",
        via: "provider-and-scratch",
        from: "bytes",
        representation: "inline-bytes",
      },
    });
  });

  it("uses a future host file scope without changing source handlers", () => {
    const decision = InputResourcePolicy.decide(
      resource({
        id: "local-file",
        name: "notes.md",
        available: {
          bytes: true,
          hostScope: { resource: "file" },
        },
      }),
      {
        ...capable,
        reference: {
          ...capable.reference,
          hostScope: { ...capable.reference.hostScope, file: true },
        },
      },
      InputResourcePolicy.REFERENCE_FIRST
    );
    expect(decision).toMatchObject({
      status: "accept",
      route: {
        kind: "reference",
        via: "host-scope",
        resource: "file",
      },
    });
  });

  it("falls back to provider delivery when URL references are disabled", () => {
    const decision = InputResourcePolicy.decide(
      resource({
        id: "library",
        name: "hero.png",
        source: "library",
        media: "raster-image",
        mimeType: "image/png",
        available: providerUrl("image/png"),
      }),
      {
        ...capable,
        reference: { ...capable.reference, url: false },
      },
      InputResourcePolicy.REFERENCE_FIRST
    );
    expect(decision).toMatchObject({
      status: "accept",
      route: {
        kind: "attachment",
        via: "provider",
        from: "url",
        representation: "inline-bytes",
      },
    });
  });

  it("falls back from an unusable host file scope to byte attachment", () => {
    const decision = InputResourcePolicy.decide(
      resource({
        id: "local-file",
        name: "notes.md",
        mimeType: "text/markdown",
        size: 3,
        available: {
          bytes: true,
          hostScope: { resource: "file" },
        },
      }),
      capable,
      InputResourcePolicy.REFERENCE_FIRST
    );
    expect(decision).toMatchObject({
      status: "accept",
      route: { kind: "attachment", via: "scratch", from: "bytes" },
    });
  });
});

describe("InputResourcePolicy invariants", () => {
  it("never attaches a directory even under a hostile custom config", () => {
    const config: InputResourcePolicy.Config = {
      id: "invalid-directory-preference",
      rules: [
        {
          id: "directory-as-bytes",
          when: () => true,
          prefer: [
            "scratch-attachment",
            "provider-and-scratch-bytes-attachment",
            "provider-bytes-attachment",
          ],
        },
      ],
    };
    const decision = InputResourcePolicy.decide(
      resource({
        id: "folder",
        name: "folder",
        kind: "directory",
        available: { bytes: true },
      }),
      capable,
      config
    );
    expect(decision).toMatchObject({
      status: "reject",
      reason: "directory-cannot-be-attached",
    });
  });

  it.each(["path-reference", "url-reference"] as const)(
    "never reclassifies a directory as a file-oriented %s",
    (preference) => {
      const decision = InputResourcePolicy.decide(
        resource({
          id: "folder",
          name: "folder",
          kind: "directory",
          available: {
            path: { space: "reference" },
            url: true,
          },
        }),
        capable,
        {
          id: "invalid-directory-reference",
          rules: [
            {
              id: "file-reference",
              when: () => true,
              prefer: [preference],
            },
          ],
        }
      );
      expect(decision).toMatchObject({
        status: "reject",
        reason: "directory-reference-required",
      });
    }
  );

  it("returns an auditable preference trace", () => {
    const decision = InputResourcePolicy.decide(
      resource({
        id: "file",
        name: "file.txt",
        available: { bytes: true },
      }),
      capable,
      {
        id: "fallback",
        rules: [
          {
            id: "try-reference-then-scratch",
            when: () => true,
            prefer: ["path-reference", "scratch-attachment"],
          },
        ],
      }
    );
    expect(decision).toMatchObject({
      status: "accept",
      trace: [
        {
          preference: "path-reference",
          available: false,
          reason: "representation-unavailable",
        },
        { preference: "scratch-attachment", available: true },
      ],
    });
  });
});

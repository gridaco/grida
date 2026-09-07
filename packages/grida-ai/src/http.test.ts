// GRIDA-SEC-004 — promoted provider download authority and bounded buffering.
import { DownloadError, type Experimental_DownloadFunction } from "ai";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { ProviderHttp } from "./http";
describe("ProviderHttp", () => {
  it("keeps its neutral URL-part signature assignable to the pinned SDK", () => {
    expectTypeOf<
      ProviderHttp["downloadParts"]
    >().toEqualTypeOf<Experimental_DownloadFunction>();
  });

  it("omission keeps provider requests ambient but denies remote asset downloads", async () => {
    // Standalone/CLI provider requests intentionally retain ambient fetch, but
    // omission cannot silently authorize an unverified remote asset route.
    const original = globalThis.fetch;
    const ambient = vi.fn<typeof globalThis.fetch>(
      async () => new Response("ok")
    );
    const http = new ProviderHttp();
    globalThis.fetch = ambient as unknown as typeof globalThis.fetch;
    try {
      await http.request("https://provider.example/request");
      await expect(
        http.downloadParts([
          {
            url: new URL("https://cdn.example/result"),
            isUrlSupportedByModel: false,
          },
        ])
      ).rejects.toThrow(/requires an authorized host transport/);
    } finally {
      globalThis.fetch = original;
    }
    expect(ambient).toHaveBeenCalledOnce();
  });

  it("automatic downloads reject private URLs before host I/O", async () => {
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>();
    const http = new ProviderHttp({ request, download });

    await expect(
      http.downloadParts([
        {
          url: new URL("http://127.0.0.1/private.png"),
          isUrlSupportedByModel: false,
        },
      ])
    ).rejects.toThrow(/must be public/);
    expect(download).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("cancels a non-success response body before rejecting it", async () => {
    const cancel = vi.fn<(reason?: unknown) => void>();
    const body = new ReadableStream<Uint8Array>({
      pull() {},
      cancel,
    });
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>(
      async () => new Response(body, { status: 502, statusText: "Bad Gateway" })
    );
    const http = new ProviderHttp({ request, download });

    const resultUrl =
      "https://cdn.example/failed.png?X-Amz-Signature=opaque-token";
    let error: unknown;
    try {
      await http.downloadParts([
        {
          url: new URL(resultUrl),
          isUrlSupportedByModel: false,
        },
      ]);
    } catch (cause) {
      error = cause;
    }

    expect(DownloadError.isInstance(error)).toBe(true);
    if (!DownloadError.isInstance(error)) throw error;
    expect(error.url).toBe(resultUrl);
    expect(error.statusCode).toBe(502);
    expect(error.message).toBe("provider asset download failed (HTTP 502)");
    expect(error.message).not.toContain("opaque-token");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels a response body when its reported redirect target is unsafe", async () => {
    const cancel = vi.fn<(reason?: unknown) => void>();
    const response = new Response(
      new ReadableStream<Uint8Array>({ pull() {}, cancel }),
      { status: 200 }
    );
    Object.defineProperties(response, {
      redirected: { value: true },
      url: { value: "http://127.0.0.1/private.png" },
    });
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>(async () => response);
    const http = new ProviderHttp({ request, download });

    await expect(
      http.downloadParts([
        {
          url: new URL("https://cdn.example/redirect.png"),
          isUrlSupportedByModel: false,
        },
      ])
    ).rejects.toThrow(/must be public/);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels a declared-oversize response body before rejecting it", async () => {
    const cancel = vi.fn<(reason?: unknown) => void>();
    const body = new ReadableStream<Uint8Array>({
      pull() {},
      cancel,
    });
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(body, {
          status: 200,
          headers: { "content-length": "4" },
        })
    );
    const http = new ProviderHttp(
      { request, download },
      { max_download_batch_bytes: 3 }
    );

    await expect(
      http.downloadParts([
        {
          url: new URL("https://cdn.example/too-large.png"),
          isUrlSupportedByModel: false,
        },
      ])
    ).rejects.toThrow(/download is too large/);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("uses a private 64 MiB aggregate production bound without allocating the declared body", async () => {
    const cancel = vi.fn<(reason?: unknown) => void>();
    const body = new ReadableStream<Uint8Array>({ pull() {}, cancel });
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(body, {
          status: 200,
          headers: { "content-length": String(64 * 1024 * 1024 + 1) },
        })
    );
    const http = new ProviderHttp({ request, download });

    await expect(
      http.downloadParts([
        {
          url: new URL("https://cdn.example/impractical.bin"),
          isUrlSupportedByModel: false,
        },
      ])
    ).rejects.toThrow(/download is too large/);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("gives one provider asset a separate 256 MiB streamed bound", async () => {
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(Uint8Array.from([1]), {
          status: 200,
          // A header above the generic 64 MiB batch ceiling proves this path
          // does not inherit that limit; the tiny body avoids a large fixture.
          headers: { "content-length": String(65 * 1024 * 1024) },
        })
    );
    const http = new ProviderHttp({ request, download });

    await expect(
      http.downloadProviderAsset(
        new URL("https://cdn.example/viewer-model.glb"),
        { declared_size_bytes: 65 * 1024 * 1024 }
      )
    ).resolves.toEqual({ data: Uint8Array.from([1]), mediaType: undefined });
    expect(download).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
  });

  it("lets the owning provider lower the retained single-asset budget", async () => {
    const cancel = vi.fn<(reason?: unknown) => void>();
    const body = new ReadableStream<Uint8Array>({ pull() {}, cancel });
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(body, {
          status: 200,
          headers: { "content-length": "4" },
        })
    );
    const http = new ProviderHttp({ request, download });

    await expect(
      http.downloadProviderAsset(
        new URL("https://cdn.example/memory-budgeted.glb"),
        { max_bytes: 3 }
      )
    ).rejects.toThrow(/download is too large/);
    expect(download).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
  });

  it("cancels a single provider asset declared above 256 MiB by the response", async () => {
    const cancel = vi.fn<(reason?: unknown) => void>();
    const body = new ReadableStream<Uint8Array>({ pull() {}, cancel });
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(body, {
          status: 200,
          headers: { "content-length": String(256 * 1024 * 1024 + 1) },
        })
    );
    const http = new ProviderHttp({ request, download });

    await expect(
      http.downloadProviderAsset(
        new URL("https://cdn.example/oversize-model.glb")
      )
    ).rejects.toThrow(/download is too large/);
    expect(cancel).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses more than 16 automatic assets before any host I/O", async () => {
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>();
    const http = new ProviderHttp({ request, download });
    const parts = Array.from({ length: 17 }, (_, index) => ({
      url: new URL(`https://cdn.example/${index}.bin`),
      isUrlSupportedByModel: false,
    }));

    await expect(http.downloadParts(parts)).rejects.toThrow(
      /maximum asset count of 16/
    );
    expect(download).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("downloads sequentially and refuses cumulative bytes across the batch", async () => {
    let resolveFirst!: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const secondCancel = vi.fn<(reason?: unknown) => void>();
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>(async (input) => {
      if (String(input).endsWith("/first.bin")) return await firstResponse;
      return new Response(
        new ReadableStream<Uint8Array>({ pull() {}, cancel: secondCancel }),
        { status: 200, headers: { "content-length": "2" } }
      );
    });
    const http = new ProviderHttp(
      { request, download },
      { max_download_batch_bytes: 3 }
    );

    const run = http.downloadParts([
      {
        url: new URL("https://cdn.example/first.bin"),
        isUrlSupportedByModel: false,
      },
      {
        url: new URL("https://cdn.example/second.bin"),
        isUrlSupportedByModel: false,
      },
    ]);

    // The second transport request cannot open while the first is unresolved.
    expect(download).toHaveBeenCalledOnce();
    resolveFirst(
      new Response(Uint8Array.from([1, 2]), {
        status: 200,
        headers: { "content-length": "2" },
      })
    );
    await expect(run).rejects.toThrow(/download is too large/);

    expect(download.mock.calls.map(([input]) => String(input))).toEqual([
      "https://cdn.example/first.bin",
      "https://cdn.example/second.bin",
    ]);
    expect(secondCancel).toHaveBeenCalledOnce();
  });

  it("preserves model-supported null positions in a bounded download batch", async () => {
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>();
    const http = new ProviderHttp(
      { request, download },
      { max_download_batch_bytes: 2 }
    );

    await expect(
      http.downloadParts([
        {
          url: new URL("data:application/octet-stream;base64,AQ=="),
          isUrlSupportedByModel: false,
        },
        {
          url: new URL("https://model.example/native.png"),
          isUrlSupportedByModel: true,
        },
        {
          url: new URL("data:application/octet-stream;base64,Ag=="),
          isUrlSupportedByModel: false,
        },
      ])
    ).resolves.toEqual([
      {
        data: Uint8Array.from([1]),
        mediaType: "application/octet-stream",
      },
      null,
      {
        data: Uint8Array.from([2]),
        mediaType: "application/octet-stream",
      },
    ]);
    expect(download).not.toHaveBeenCalled();
  });

  it("cancels a streamed download before constructing an oversize result", async () => {
    const cancel = vi.fn<(reason?: unknown) => void>();
    let pull = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(
          pull++ === 0 ? Uint8Array.from([1, 2]) : Uint8Array.from([3, 4])
        );
      },
      cancel,
    });
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>(async () =>
      Promise.resolve(new Response(body, { status: 200 }))
    );
    const http = new ProviderHttp(
      { request, download },
      { max_download_batch_bytes: 3 }
    );

    await expect(
      http.downloadParts([
        {
          url: new URL("https://cdn.example/stream.bin"),
          isUrlSupportedByModel: false,
        },
      ])
    ).rejects.toThrow(/download is too large/);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("decodes base64 data URLs locally without crossing host HTTP", async () => {
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>();
    const http = new ProviderHttp({ request, download });

    await expect(
      http.downloadParts([
        {
          url: new URL("data:image/png;base64,iVBORw=="),
          isUrlSupportedByModel: false,
        },
      ])
    ).resolves.toEqual([
      {
        data: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
        mediaType: "image/png",
      },
    ]);
    expect(request).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("decodes percent-encoded data URL bytes and preserves media type", async () => {
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>();
    const http = new ProviderHttp({ request, download });

    await expect(
      http.downloadParts([
        {
          url: new URL(
            "data:text/plain;charset=utf-8,hello%20%E2%98%83#not-content"
          ),
          isUrlSupportedByModel: false,
        },
      ])
    ).resolves.toEqual([
      {
        data: new TextEncoder().encode("hello ☃"),
        mediaType: "text/plain;charset=utf-8",
      },
    ]);
    expect(request).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("enforces the decoded-byte bound for inline data before host I/O", async () => {
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>();
    const http = new ProviderHttp(
      { request, download },
      { max_download_batch_bytes: 3 }
    );

    await expect(
      http.downloadParts([
        {
          url: new URL("data:application/octet-stream;base64,AQIDBA=="),
          isUrlSupportedByModel: false,
        },
      ])
    ).rejects.toThrow(/exceeds maximum size of 3 bytes/);
    expect(request).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("rejects malformed inline base64 without crossing host HTTP", async () => {
    const request = vi.fn<typeof globalThis.fetch>();
    const download = vi.fn<typeof globalThis.fetch>();
    const http = new ProviderHttp({ request, download });

    await expect(
      http.downloadParts([
        {
          url: new URL("data:image/png;base64,%%%"),
          isUrlSupportedByModel: false,
        },
      ])
    ).rejects.toThrow(/invalid base64 data URL/);
    expect(request).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("releases a repeated-chunk download and its single abort subscription", async () => {
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    let chunks = 0;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(stream) {
          if (chunks++ === 1024) {
            stream.close();
            return;
          }
          stream.enqueue(new Uint8Array([1]));
        },
      })
    );
    const http = new ProviderHttp({
      request: vi.fn<typeof fetch>(),
      download: async () => response,
    });
    const result = await http.downloadProviderAsset(
      new URL("https://assets.example/video"),
      { signal: controller.signal }
    );
    expect(result.data.byteLength).toBe(1024);
    expect(add).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
    expect(response.body!.locked).toBe(false);
  });
});

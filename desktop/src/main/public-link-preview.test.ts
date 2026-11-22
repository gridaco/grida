/** GRIDA-SEC-016 — public preview outcomes under an isolated DNS and HTTP fixture. */
import type { LookupAddress } from "node:dns";
import { EventEmitter } from "node:events";
import type {
  IncomingMessage,
  IncomingHttpHeaders,
  RequestOptions,
} from "node:http";
import { Readable } from "node:stream";
import { beforeEach, expect, it, vi } from "vitest";
import { WebPreview } from "@grida/desktop-bridge";
import type { BrowserFaviconDecoder } from "./browser-favicon-decoder";
import { WebPreviewService } from "./web-preview";
import { WebPreviewProviders } from "./web-preview-providers";

const network = vi.hoisted(() => ({
  lookup: vi.fn<(hostname: string) => Promise<LookupAddress[]>>(),
  get: vi.fn<
    (
      options: RequestOptions,
      response: (value: IncomingMessage) => void
    ) => EventEmitter
  >(),
}));

vi.mock("node:dns/promises", () => ({ lookup: network.lookup }));
vi.mock("node:https", () => ({ get: network.get }));

const signal = new AbortController().signal;
const publicAddress: LookupAddress = { address: "93.184.216.34", family: 4 };
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XZE0YAAAAASUVORK5CYII=";
const favicon = { dataUrl: `data:image/png;base64,${png}` };
// Minimal JPEG framing simulates the sandbox's result. The Electron proof uses a real codec.
const image = {
  dataUrl: `data:image/jpeg;base64,${Buffer.from(
    "ffd8ffc0000b080001000101011100ffda0008010100003f0000ffd9",
    "hex"
  ).toString("base64")}`,
};

function response(
  statusCode: number,
  headers: IncomingHttpHeaders,
  body: string | Buffer = ""
) {
  return Object.assign(Readable.from([Buffer.from(body)]), {
    statusCode,
    headers,
  }) as unknown as IncomingMessage;
}

function reply(html: string) {
  network.get.mockImplementation((_options, done) => {
    done(response(200, { "content-type": "text/html" }, html));
    return new EventEmitter();
  });
}

beforeEach(() => {
  network.lookup.mockReset().mockResolvedValue([publicAddress]);
  network.get.mockReset();
});

it("adds bundled product labels to public page metadata when providers are enabled", async () => {
  reply(
    '<title>Public preview</title><meta name="application-name" data-grida-fx-viewer="1">' +
      '<meta property="og:description" content="Open Graph description">'
  );
  const url = "https://example.com/viewer";
  const standard = {
    title: "Public preview",
    description: "Open Graph description",
  };
  await expect(
    new WebPreviewService().lookupPublicLink("scope", url, signal)
  ).resolves.toEqual(standard);

  const providers = WebPreviewProviders.bundled();
  await expect(
    new WebPreviewService({ providers }).lookupPublicLink("scope", url, signal)
  ).resolves.toEqual({ ...standard, productLabel: "FX Viewer" });

  const resolve = vi.fn<() => Promise<{ title: string }>>(async () => ({
    title: "Resolver title",
  }));
  await expect(
    new WebPreviewService({
      providers: providers.map((provider) => ({ ...provider, resolve })),
    }).lookupPublicLink("scope", url, signal)
  ).resolves.toEqual(standard);
  expect(resolve).not.toHaveBeenCalled();
});

it("reuses public hits for an hour and retries public misses after five seconds", async () => {
  const service = new WebPreviewService();
  const read = () =>
    service.lookupResult(
      "public",
      "scope",
      "https://example.com/viewer",
      signal
    );
  network.get.mockImplementation((_options, done) => {
    done(response(503, {}));
    return new EventEmitter();
  });
  let now = 0;
  const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  try {
    await expect(read()).resolves.toEqual({ metadata: null });
    reply("<title>Viewer</title>");
    now = 4_999;
    await expect(read()).resolves.toEqual({ metadata: null });
    expect(network.get).toHaveBeenCalledTimes(1);

    now = 5_000;
    await expect(read()).resolves.toEqual({ metadata: { title: "Viewer" } });
    reply("<title>Updated viewer</title>");
    now = 3_604_999;
    await expect(read()).resolves.toEqual({ metadata: { title: "Viewer" } });
    expect(
      network.get.mock.calls.filter(([request]) => request.path === "/viewer")
    ).toHaveLength(2);

    now = 3_605_000;
    await expect(read()).resolves.toEqual({
      metadata: { title: "Updated viewer" },
    });
    expect(
      network.get.mock.calls.filter(([request]) => request.path === "/viewer")
    ).toHaveLength(3);
  } finally {
    clock.mockRestore();
  }
});

it("publishes no miss when the public DNS budget defers a preview", async () => {
  const dns = Promise.withResolvers<LookupAddress[]>();
  network.lookup.mockReturnValue(dns.promise);
  const holding = [new WebPreviewService(), new WebPreviewService()];
  const controllers = Array.from({ length: 4 }, () => new AbortController());
  const url = "https://example.com/viewer";
  const requests = controllers.map(({ signal }, index) =>
    holding[index % 2]!.lookupResult("public", `scope-${index}`, url, signal)
  );
  const deferred = new WebPreviewService();
  try {
    await vi.waitFor(() => expect(network.lookup).toHaveBeenCalledTimes(4));
    await expect(
      deferred.lookupResult("public", "waiting", url, signal)
    ).resolves.toBeNull();
    expect(network.get).not.toHaveBeenCalled();
  } finally {
    for (const controller of controllers) controller.abort();
    dns.resolve([publicAddress]);
    await Promise.all(requests);
  }
  reply("<title>Available viewer</title>");
  await expect(
    deferred.lookupResult("public", "waiting", url, signal)
  ).resolves.toEqual({ metadata: { title: "Available viewer" } });
});

it("fetches only the declared preview images and uses the validated address for each connection", async () => {
  const html =
    '<title>Generic title</title><meta name="description" content="Generic description">' +
    '<meta property="og:title" content="  Public &amp; page  ">' +
    '<meta property="og:image" content="https://cdn.example.com/image">' +
    '<link rel="icon" href="/icon.svg"><script src="/script"></script>' +
    "</head><body>Page text</body>";
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>';
  network.get.mockImplementation(({ path }, done) => {
    if (path === "/icon.svg")
      done(response(200, { "content-type": "image/svg+xml" }, svg));
    else if (path === "/image")
      done(
        response(
          200,
          { "content-type": "image/png" },
          Buffer.from(png, "base64")
        )
      );
    else done(response(200, { "content-type": "text/html" }, html));
    return new EventEmitter();
  });
  const decode = vi
    .fn<BrowserFaviconDecoder["decode"]>()
    .mockResolvedValue(favicon);
  const decodeLinkImage = vi
    .fn<BrowserFaviconDecoder["decodeLinkImage"]>()
    .mockResolvedValue(image);
  const service = new WebPreviewService({ decode, decodeLinkImage });
  const result = {
    title: "Public & page",
    description: "Generic description",
    favicon,
    image,
  };
  await expect(
    Promise.all([
      service.lookupPublicLink(
        "scope",
        "https://example.com/path?q=1#one",
        signal
      ),
      service.lookupPublicLink(
        "scope",
        "https://example.com/path?q=1#two",
        signal
      ),
    ])
  ).resolves.toEqual([result, result]);
  await expect(
    service.lookupPublicLink("scope", "https://example.com/path?q=1", signal)
  ).resolves.toEqual(result);
  expect(
    network.get.mock.calls.map(([options]) => [options.hostname, options.path])
  ).toEqual([
    ["example.com", "/path?q=1"],
    ["example.com", "/icon.svg"],
    ["cdn.example.com", "/image"],
  ]);
  expect(decode).toHaveBeenCalledExactlyOnceWith(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    expect.any(AbortSignal)
  );
  expect(decodeLinkImage).toHaveBeenCalledExactlyOnceWith(
    favicon.dataUrl,
    expect.any(AbortSignal)
  );
  const options = network.get.mock.calls[0]![0];
  expect(options).toMatchObject({
    hostname: "example.com",
    path: "/path?q=1",
    agent: false,
    autoSelectFamily: false,
    rejectUnauthorized: true,
  });
  for (const [request] of network.get.mock.calls) {
    expect(request.headers).toEqual({
      Host: request.hostname,
      "Accept-Encoding": "identity",
    });
    const checked =
      vi.fn<Parameters<NonNullable<RequestOptions["lookup"]>>[2]>();
    request.lookup?.(request.hostname!, {}, checked);
    expect(checked).toHaveBeenCalledWith(
      null,
      publicAddress.address,
      publicAddress.family
    );
  }
  expect(network.lookup.mock.calls.map(([host]) => host)).toEqual([
    "example.com",
    "example.com",
    "cdn.example.com",
  ]);
});

it("keeps text when a favicon redirects to a private address and a banner exceeds the bound", async () => {
  const html =
    '<title>Page title</title><link rel="icon" href="/icon">' +
    '<meta property="og:image" content="/banner">';
  network.lookup.mockImplementation(async (host) =>
    host === "internal.example.com"
      ? [{ address: "10.0.0.1", family: 4 }]
      : [publicAddress]
  );
  network.get.mockImplementation(({ path }, done) => {
    if (path === "/icon")
      done(response(302, { location: "https://internal.example.com/icon" }));
    else if (path === "/banner")
      done(
        response(200, {
          "content-type": "image/png",
          "content-length": String(3 * 1024 * 1024),
        })
      );
    else done(response(200, { "content-type": "text/html" }, html));
    return new EventEmitter();
  });
  const decode = vi.fn<BrowserFaviconDecoder["decode"]>();
  const decodeLinkImage = vi.fn<BrowserFaviconDecoder["decodeLinkImage"]>();
  const service = new WebPreviewService({ decode, decodeLinkImage });
  await expect(
    service.lookupPublicLink("scope", "https://example.com/", signal)
  ).resolves.toEqual({ title: "Page title" });
  expect(network.lookup).toHaveBeenCalledWith(
    "internal.example.com",
    expect.any(Object)
  );
  expect(
    network.get.mock.calls.every(
      ([options]) => options.hostname === "example.com"
    )
  ).toBe(true);
  expect(decode).not.toHaveBeenCalled();
  expect(decodeLinkImage).not.toHaveBeenCalled();
});

it("keeps text and the favicon when the banner exceeds the request deadline", async () => {
  const html =
    '<title>Page title</title><meta property="og:image" content="/banner">';
  network.get.mockImplementation(({ path, signal }, done) => {
    const request = new EventEmitter();
    if (path === "/banner") {
      signal?.addEventListener(
        "abort",
        () => request.emit("error", signal.reason),
        { once: true }
      );
    } else if (path === "/favicon.ico") {
      done(
        response(
          200,
          { "content-type": "image/png" },
          Buffer.from(png, "base64")
        )
      );
    } else done(response(200, { "content-type": "text/html" }, html));
    return request;
  });
  const service = new WebPreviewService({
    decode: vi.fn<BrowserFaviconDecoder["decode"]>().mockResolvedValue(favicon),
  });
  await expect(
    service.lookupPublicLink("scope", "https://example.com/", signal)
  ).resolves.toEqual({ title: "Page title", favicon });
});

it("refuses local destinations and non-public DNS results before connecting", async () => {
  const service = new WebPreviewService();
  await expect(
    service.lookupPublicLink("scope", "http://localhost:3000/", signal)
  ).resolves.toBeNull();
  await expect(
    service.lookupPublicLink("scope", "https://[::1]/", signal)
  ).resolves.toBeNull();
  expect(network.lookup).not.toHaveBeenCalled();
  network.lookup.mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);
  await expect(
    service.lookupPublicLink("scope", "https://example.com/", signal)
  ).resolves.toBeNull();
  expect(network.get).not.toHaveBeenCalled();
});

it("checks a public redirect's destination again before connecting", async () => {
  network.lookup.mockResolvedValueOnce([publicAddress]);
  network.lookup.mockResolvedValueOnce([{ address: "fd00::1", family: 6 }]);
  network.get.mockImplementation((_options, done) => {
    done(response(302, { location: "https://redirect.example.com/" }));
    return new EventEmitter();
  });
  await expect(
    new WebPreviewService().lookupPublicLink(
      "scope",
      "https://example.com/",
      signal
    )
  ).resolves.toBeNull();
  expect(network.lookup.mock.calls.map(([host]) => host)).toEqual([
    "example.com",
    "redirect.example.com",
  ]);
  expect(network.get).toHaveBeenCalledTimes(1);
});

it("caps the inspected HTML prefix and validates the display-only result", async () => {
  reply(
    "<title>Bounded title</title>" +
      " ".repeat(64 * 1024) +
      '<meta property="og:title" content="Outside the budget">'
  );
  await expect(
    new WebPreviewService().lookupPublicLink(
      "scope",
      "https://example.com/",
      signal
    )
  ).resolves.toEqual({ title: "Bounded title" });
  expect(
    WebPreview.parseLinkMetadata({
      title: "Bad\u0000title",
      description: "Safe fallback",
      favicon: { dataUrl: "ignored" },
    })
  ).toEqual({ description: "Safe fallback" });
});

it("retires a lookup that is cancelled while DNS is pending", async () => {
  const dns = Promise.withResolvers<LookupAddress[]>();
  network.lookup.mockReturnValue(dns.promise);
  const controller = new AbortController();
  const result = new WebPreviewService().lookupPublicLink(
    "scope",
    "https://example.com/",
    controller.signal
  );
  expect(network.lookup).toHaveBeenCalledTimes(1);
  controller.abort();
  dns.resolve([publicAddress]);
  await expect(result).resolves.toBeNull();
  expect(network.get).not.toHaveBeenCalled();
});

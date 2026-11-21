/** GRIDA-SEC-016 — lifecycle and network perimeter for loopback link previews. */
import { once } from "node:events";
import { createServer, type RequestListener, type Server } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { WebPreview } from "@grida/desktop-bridge";
import type { BrowserFaviconDecoder } from "./browser-favicon-decoder";
import { WebPreviewService, type WebPreviewProvider } from "./web-preview";

const servers: Server[] = [];
const services: WebPreviewService[] = [];
const defaultSignal = new AbortController().signal;
const favicon = {
  dataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XZE0YAAAAASUVORK5CYII=",
};

function service(options?: ConstructorParameters<typeof WebPreviewService>[0]) {
  const result = new WebPreviewService(options);
  services.push(result);
  return result;
}

async function serve(listener: RequestListener): Promise<string> {
  const server = createServer(listener);
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  for (const service of services.splice(0)) service.clear();
  await Promise.all(
    servers.splice(0).map((server) => {
      const closed = once(server, "close");
      server.close();
      server.closeAllConnections();
      return closed;
    })
  );
});

it("uses an inert head and honors an open tab's observed title and icon", async () => {
  const requests: string[] = [];
  const decode = vi
    .fn<BrowserFaviconDecoder["decode"]>()
    .mockResolvedValue(favicon);
  const provider: WebPreviewProvider = {
    id: "fixture",
    match: { meta: "application-name", attributes: { "data-fixture": "1" } },
    productLabel: "Fixture Viewer",
  };
  const origin = await serve((request, response) => {
    requests.push(request.url!);
    expect(request.headers.host).toMatch(/^app\.localhost:/);
    expect(request.headers.cookie).toBeUndefined();
    expect(request.headers.authorization).toBeUndefined();
    if (request.url === "/assets/icon.svg") {
      response
        .writeHead(200, { "Content-Type": "image/svg+xml" })
        .end('<svg xmlns="http://www.w3.org/2000/svg"/>');
      return;
    }
    response
      .writeHead(200, {
        "Content-Type": "text/html",
        "Set-Cookie": "fixture=ignored",
      })
      .end(
        '<title>Preview &amp; page</title><base href="/assets/">' +
          '<meta name="description" content="  A   local page. ">' +
          '<meta name="application-name" data-fixture="1">' +
          '<link href="icon.svg" rel="icon" type="image/svg+xml">' +
          '<script src="/must-not-load"></script><img src="/must-not-load">'
      );
  });
  const url = origin.replace("127.0.0.1", "app.localhost") + "/pages/example";
  const previews = service({ providers: [provider], decode });
  expect(
    await previews.lookup("a", url, defaultSignal, {
      title: "Open tab",
      favicon,
    })
  ).toEqual({
    title: "Open tab",
    description: "A local page.",
    productLabel: "Fixture Viewer",
    favicon,
  });
  expect(requests).toEqual(["/pages/example"]);
  expect(await previews.lookup("a", url, defaultSignal)).toEqual({
    title: "Preview & page",
    description: "A local page.",
    productLabel: "Fixture Viewer",
    favicon,
  });
  expect(requests).toEqual([
    "/pages/example",
    "/pages/example",
    "/assets/icon.svg",
  ]);
  expect(decode).toHaveBeenCalledWith(
    expect.stringMatching(/^data:image\/svg\+xml;base64,/),
    expect.any(AbortSignal)
  );
});

it("bounds redirects and uses only loopback links on the original origin", async () => {
  const foreign = vi.fn<RequestListener>((_request, response) =>
    response.end()
  );
  const other = await serve(foreign);
  const paths: string[] = [];
  const origin = await serve((request, response) => {
    paths.push(request.url!);
    if (request.url === "/local") {
      response.writeHead(302, { Location: "/page" }).end();
    } else if (request.url === "/foreign") {
      response.writeHead(302, { Location: other + "/page" }).end();
    } else if (request.url === "/page") {
      response
        .writeHead(200, { "Content-Type": "text/html" })
        .end(`<title>Local</title><link rel="icon" href="${other}/icon.svg">`);
    } else {
      response.writeHead(404).end();
    }
  });
  const previews = service();
  expect(await previews.lookup("a", origin + "/local", defaultSignal)).toEqual({
    title: "Local",
  });
  expect(
    await previews.lookup("a", origin + "/foreign", defaultSignal)
  ).toBeNull();
  expect(
    await previews.lookup("a", "https://example.invalid/page", defaultSignal)
  ).toBeNull();
  expect(
    await previews.lookup(
      "a",
      origin.replace("://", "://user:secret@"),
      defaultSignal
    )
  ).toBeNull();
  expect(paths).toEqual(["/local", "/page", "/favicon.ico", "/foreign"]);
  expect(foreign).not.toHaveBeenCalled();
});

it("accepts extension registration and removal without changing the resolver", async () => {
  const resolve = vi.fn<NonNullable<WebPreviewProvider["resolve"]>>(
    async ({ read }) => {
      const content = await read("/details");
      expect(await read("/second")).toBeNull();
      return { description: content ?? "" };
    }
  );
  const origin = await serve((request, response) => {
    if (request.url === "/details") {
      response
        .writeHead(200, { "Content-Type": "text/plain" })
        .end("Second provider");
    } else if (request.url === "/favicon.ico") {
      response.writeHead(404).end();
    } else {
      response
        .writeHead(200, { "Content-Type": "text/html" })
        .end(
          `<title>Generic</title><meta name="generator" content="${request.url}">`
        );
    }
  });
  const previews = service({
    providers: [
      {
        id: "first",
        match: { meta: "generator", attributes: { content: "/first" } },
        productLabel: "First",
      },
    ],
  });
  const descriptor = {
    id: "second",
    match: { meta: "generator", attributes: { content: "/second" } },
    productLabel: "Second",
    resolve,
  };
  const remove = previews.register(descriptor);
  expect(await previews.lookup("a", origin + "/first", defaultSignal)).toEqual({
    title: "Generic",
    productLabel: "First",
  });
  expect(await previews.lookup("a", origin + "/second", defaultSignal)).toEqual(
    { title: "Generic", description: "Second provider", productLabel: "Second" }
  );
  const settle = previews.register({ ...descriptor, id: "duplicate-match" });
  expect(await previews.lookup("a", origin + "/second", defaultSignal)).toEqual(
    { title: "Generic" }
  );
  expect(resolve).toHaveBeenCalledTimes(1);
  settle();
  remove();
  expect(await previews.lookup("a", origin + "/second", defaultSignal)).toEqual(
    { title: "Generic" }
  );
});

it("shares a lookup until its last reader leaves and reuses negative results", async () => {
  const received: string[] = [];
  const closed = vi.fn<() => void>();
  const origin = await serve((request, response) => {
    received.push(request.url!);
    if (request.url === "/slow") {
      response.on("close", closed);
    } else {
      response.writeHead(503).end();
    }
  });
  const previews = service();
  const first = new AbortController();
  const second = new AbortController();
  const a = previews.lookup("same", origin + "/slow", first.signal);
  const b = previews.lookup("same", origin + "/slow", second.signal);
  await vi.waitFor(() => expect(received).toEqual(["/slow"]));
  first.abort();
  expect(await a).toBeNull();
  expect(closed).not.toHaveBeenCalled();
  second.abort();
  expect(await b).toBeNull();
  await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
  expect(
    await previews.lookup("same", origin + "/offline", defaultSignal)
  ).toBeNull();
  expect(
    await previews.lookup("same", origin + "/offline", defaultSignal)
  ).toBeNull();
  expect(received).toEqual(["/slow", "/offline"]);
});

it("uses two workers and clears only the retiring attachment's work", async () => {
  const requests: string[] = [];
  const origin = await serve((request, response) => {
    requests.push(request.url!);
    if (request.url === "/three") response.writeHead(404).end();
  });
  const previews = service();
  const a = previews.lookup("a", origin + "/one", defaultSignal);
  const b = previews.lookup("b", origin + "/two", defaultSignal);
  const c = previews.lookup("c", origin + "/three", defaultSignal);
  await vi.waitFor(() => expect(requests).toEqual(["/one", "/two"]));
  previews.clear("a");
  expect(await a).toBeNull();
  expect(await c).toBeNull();
  expect(requests).toEqual(["/one", "/two", "/three"]);
  previews.clear("b");
  expect(await b).toBeNull();
});

it("aborts favicon decoding when the owning scope retires", async () => {
  const decoderAborted = vi.fn<() => void>();
  const decode = vi.fn<BrowserFaviconDecoder["decode"]>(
    (_source, signal) =>
      new Promise((resolve) => {
        signal.addEventListener(
          "abort",
          () => {
            decoderAborted();
            resolve(null);
          },
          { once: true }
        );
      })
  );
  const origin = await serve((request, response) => {
    if (request.url === "/favicon.ico") {
      response
        .writeHead(200, { "Content-Type": "image/x-icon" })
        .end("fixture");
    } else {
      response
        .writeHead(200, { "Content-Type": "text/html" })
        .end("<title>Local</title>");
    }
  });
  const previews = service({ decode });
  const lookup = previews.lookup("retired", origin, defaultSignal);
  await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
  previews.clear("retired");
  expect(await lookup).toBeNull();
  expect(decoderAborted).toHaveBeenCalledTimes(1);
});

it("returns bounded generic metadata if a provider exceeds its deadline", async () => {
  const origin = await serve((request, response) => {
    if (request.url === "/favicon.ico") {
      response.writeHead(404).end();
    } else {
      response
        .writeHead(200, { "Content-Type": "text/html" })
        .end(
          `<title>${"✅".repeat(300)}</title><meta name="generator" content="slow">` +
            "<body>" +
            "x".repeat(96 * 1024)
        );
    }
  });
  const previews = service({
    providers: [
      {
        id: "slow",
        match: { meta: "generator", attributes: { content: "slow" } },
        productLabel: "Slow",
        resolve: () => new Promise(() => {}),
      },
    ],
  });
  expect(await previews.lookup("a", origin, defaultSignal)).toEqual({
    title: "✅".repeat(Math.floor(WebPreview.MAX_TITLE_BYTES / 3)),
  });
});

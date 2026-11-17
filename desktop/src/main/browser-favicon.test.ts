// GRIDA-SEC-016 — public-icon routing, byte/deadline bounds and stale document data.
import type { Session } from "electron";
import { afterEach, expect, it, vi } from "vitest";
import { DesktopBrowser } from "@grida/desktop-bridge";
import { BrowserFavicon } from "./browser-favicon";

const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGNwaDjwHwAFBAKAPJ4DgAAAAABJRU5ErkJggg==",
    "base64"
  )
);
const icon = {
  dataUrl: "data:image/png;base64," + Buffer.from(png).toString("base64"),
};
const response = () =>
  new Response(png, {
    headers: { "Content-Type": "application/octet-stream" },
  });
function fixture() {
  let current = true;
  const fetch = vi.fn<Session["fetch"]>(
    async () => new Response(null, { status: 404 })
  );
  const changed = vi.fn<() => void>();
  const icons = new BrowserFavicon({
    session: { fetch },
    current: () => current,
    changed,
  });
  return {
    icons,
    fetch,
    changed,
    revoke: () => {
      current = false;
      icons.clear();
    },
  };
}
afterEach(() => vi.useRealTimers());

it("uses the supplied guest Session for public raster bytes and keeps getter reads cache-only", async () => {
  const f = fixture();
  f.fetch.mockResolvedValue(response());
  f.icons.update(["https://cdn.example/icon.png"], "https://example.com/page");
  await vi.waitFor(() => expect(f.icons.get()).toEqual(icon));
  expect(f.fetch).toHaveBeenCalledExactlyOnceWith(
    "https://cdn.example/icon.png",
    expect.objectContaining({
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
      signal: expect.any(AbortSignal),
    })
  );
  const changes = f.changed.mock.calls.length;
  f.icons.get();
  f.icons.get();
  f.icons.update(["https://cdn.example/icon.png"], "https://example.com/page");
  expect(f.fetch).toHaveBeenCalledOnce();
  expect(f.changed).toHaveBeenCalledTimes(changes);
  f.revoke();
});

it("accepts bounded inline raster icons without networking and rejects SVG inline content", async () => {
  const f = fixture();
  f.icons.update([icon.dataUrl], "https://example.com/page");
  expect(f.icons.get()).toEqual(icon);
  expect(f.fetch).not.toHaveBeenCalled();
  f.icons.update(
    ["data:image/svg+xml;base64,PHN2Zy8+"],
    "https://example.com/page"
  );
  await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledOnce());
  expect(f.fetch.mock.calls[0]![0]).toBe("https://example.com/favicon.ico");
  f.revoke();
});

it("uses one conventional same-page-origin fallback when only SVG or unsafe candidates are advertised", async () => {
  const f = fixture();
  f.fetch.mockResolvedValue(response());
  f.icons.update(
    [
      "https://example.com/icon.svg",
      "file:///private/icon.ico",
      "https://user:pass@example.com/icon.png",
    ],
    "https://example.com/path/page"
  );
  await vi.waitFor(() => expect(f.icons.get()).toEqual(icon));
  expect(f.fetch).toHaveBeenCalledExactlyOnceWith(
    "https://example.com/favicon.ico",
    expect.any(Object)
  );
  f.revoke();
});

it("follows bounded manual HTTP redirects using the requested URL rather than response.url", async () => {
  const f = fixture();
  f.fetch
    .mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://cdn.example/folder/one" },
      })
    )
    .mockResolvedValueOnce(
      new Response(null, { status: 307, headers: { location: "../two.png" } })
    )
    .mockResolvedValueOnce(response());
  f.icons.update(["https://example.com/icon"], "https://example.com/page");
  await vi.waitFor(() => expect(f.icons.get()).toEqual(icon));
  expect(f.fetch.mock.calls.map(([url]) => url)).toEqual([
    "https://example.com/icon",
    "https://cdn.example/folder/one",
    "https://cdn.example/two.png",
  ]);
  f.revoke();
});

it.each([
  "file:///private/icon",
  "data:image/png;base64,AA==",
  "grida-workspace://private/icon",
  "https://user:pass@example.com/icon",
  "https://@example.com/icon",
  "https:\\\\example.com/icon",
  "/i\ncon",
  " /relative-icon",
])("does not follow an unsafe redirect to %s", async (destination) => {
  const f = fixture();
  const redirect = new Response(null, { status: 302 });
  vi.spyOn(redirect.headers, "get").mockReturnValue(destination);
  f.fetch.mockResolvedValueOnce(redirect);
  f.icons.update(["https://example.com/icon"], "https://example.com/page");
  await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(2));
  expect(f.fetch.mock.calls.map(([url]) => url)).toEqual([
    "https://example.com/icon",
    "https://example.com/favicon.ico",
  ]);
  expect(f.icons.get()).toBeNull();
  f.revoke();
});

it("caps advertised candidates and redirect work independently of website list length", async () => {
  const f = fixture();
  f.fetch.mockImplementation(
    async (url) =>
      new Response(null, {
        status: 302,
        headers: { location: String(url) + "x" },
      })
  );
  f.icons.update(
    Array.from(
      { length: 1000 },
      (_, index) => `https://example.com/icon-${index}`
    ),
    "https://example.com/page"
  );
  await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(12));
  expect(
    new Set(f.fetch.mock.calls.map(([url]) => String(url).replace(/x+$/, "")))
  ).toEqual(
    new Set([
      "https://example.com/icon-0",
      "https://example.com/icon-1",
      "https://example.com/favicon.ico",
    ])
  );
  expect(f.icons.get()).toBeNull();
  f.revoke();
});

it("aborts its total deadline without starting another concurrent fetch", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.fetch.mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true }
        )
      )
  );
  f.icons.update(["https://example.com/slow"], "https://example.com/page");
  const signal = f.fetch.mock.calls[0]![1]!.signal!;
  await vi.advanceTimersByTimeAsync(3000);
  expect(signal.aborted).toBe(true);
  expect(f.fetch).toHaveBeenCalledOnce();
  expect(f.icons.get()).toBeNull();
  f.revoke();
});

it("bounds streamed decoded bytes and cancels oversized response bodies", async () => {
  const f = fixture();
  const canceled = vi.fn<() => void>();
  f.fetch.mockImplementation(
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new Uint8Array(DesktopBrowser.MAX_FAVICON_BYTES + 1)
            );
          },
          cancel: canceled,
        })
      )
  );
  f.icons.update(["https://example.com/oversized"], "https://example.com/page");
  await vi.waitFor(() => expect(canceled).toHaveBeenCalledTimes(2));
  expect(f.icons.get()).toBeNull();
  expect(f.changed).not.toHaveBeenCalled();
  f.revoke();
});

it("coalesces updates while an old fetch ignores cancellation and discards that stale result", async () => {
  const f = fixture();
  let release!: (value: Response) => void;
  f.fetch
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    )
    .mockResolvedValue(response());
  f.icons.update(["https://example.com/first"], "https://example.com/page");
  const signal = f.fetch.mock.calls[0]![1]!.signal!;
  f.icons.update(["https://example.com/second"], "https://example.com/page");
  f.icons.update(["https://example.com/latest"], "https://example.com/page");
  expect(signal.aborted).toBe(true);
  expect(f.fetch).toHaveBeenCalledOnce();
  release(response());
  await vi.waitFor(() => expect(f.icons.get()).toEqual(icon));
  expect(f.fetch.mock.calls.map(([url]) => url)).toEqual([
    "https://example.com/first",
    "https://example.com/latest",
  ]);
  expect(f.changed).toHaveBeenCalledOnce();
  f.revoke();
});

it("clears cached data and cancels a pending response when its document loses authority", async () => {
  const f = fixture();
  f.fetch.mockResolvedValueOnce(response());
  f.icons.update(["https://example.com/first"], "https://example.com/page");
  await vi.waitFor(() => expect(f.icons.get()).toEqual(icon));
  let release!: (value: Response) => void;
  f.fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  f.icons.update(["https://example.com/next"], "https://example.com/page");
  const signal = f.fetch.mock.calls.at(-1)![1]!.signal!;
  f.revoke();
  expect(signal.aborted).toBe(true);
  expect(f.icons.get()).toBeNull();
  release(response());
  await Promise.resolve();
  await Promise.resolve();
  expect(f.icons.get()).toBeNull();
  expect(f.changed).toHaveBeenCalledTimes(2);
});

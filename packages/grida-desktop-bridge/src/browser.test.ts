// GRIDA-SEC-016 — bounded native browser contract and destination pins.
import { describe, expect, expectTypeOf, it } from "vitest";
import { DesktopBrowser, DESKTOP_BRIDGE_PROTOCOL } from "./index";
import type { DesktopBridge, DesktopNativeCapabilities } from "./index";

const page = (
  overrides: Partial<DesktopBrowser.Page> = {}
): DesktopBrowser.Page => ({
  id: "page-1",
  revision: 1,
  url: "https://example.com/",
  title: "Example",
  loading: false,
  canGoBack: false,
  canGoForward: false,
  focused: false,
  storageScope: "workspace",
  failure: null,
  ...overrides,
});

const snapshot = (
  pages: readonly DesktopBrowser.Page[] = [page()]
): DesktopBrowser.Snapshot => ({
  version: 1,
  attachmentId: "attachment-1",
  revision: 1,
  pages,
});

describe("DesktopBrowser optional capability", () => {
  it("keeps protocol one compatible when older hosts omit the browser", () => {
    const older: Pick<DesktopBridge, "browser"> = {};
    const capabilities: Pick<DesktopNativeCapabilities, "browser"> = {};
    expect(older.browser).toBeUndefined();
    expect(capabilities.browser).toBeUndefined();
    expect(DESKTOP_BRIDGE_PROTOCOL).toBe(1);
    expect(DesktopBrowser.VERSION).toBe(1);
    expectTypeOf<DesktopBridge["browser"]>().toEqualTypeOf<
      DesktopBrowser.Bridge | undefined
    >();
  });

  it("keeps Settings clearing optional and limited to one workspace identity", () => {
    type Clear = NonNullable<DesktopBrowser.Bridge["clearWorkspaceData"]>;
    const older: Pick<DesktopBrowser.Bridge, "clearWorkspaceData"> = {};
    expect(older.clearWorkspaceData).toBeUndefined();
    expectTypeOf<Parameters<Clear>>().toEqualTypeOf<
      [request: Readonly<{ workspaceId: string }>]
    >();
    expectTypeOf<Awaited<ReturnType<Clear>>>().toEqualTypeOf<boolean>();
    expectTypeOf<keyof Parameters<Clear>[0]>().toEqualTypeOf<"workspaceId">();
    expectTypeOf<
      Parameters<DesktopBrowser.Bridge["clearSession"]>
    >().toEqualTypeOf<[request: Readonly<{ attachmentId: string }>]>();
    expect(DesktopBrowser.VERSION).toBe(1);
  });

  it("requires explicit storage scope and permits omission only for blank creation URLs", () => {
    const blank: DesktopBrowser.Create = {
      attachmentId: "attachment-1",
      storageScope: "ephemeral",
    };
    expect(blank).not.toHaveProperty("url");
    expectTypeOf<DesktopBrowser.Create["storageScope"]>().toEqualTypeOf<
      "workspace" | "ephemeral"
    >();
    expectTypeOf<DesktopBrowser.Navigate["url"]>().toEqualTypeOf<string>();
    expect(DesktopBrowser.isStorageScope(undefined)).toBe(false);
    expect(DesktopBrowser.isStorageScope("persist:partition")).toBe(false);
    expect(DesktopBrowser.isStorageScope("workspace")).toBe(true);
    expect(DesktopBrowser.isStorageScope("ephemeral")).toBe(true);
  });

  it("exposes purpose-specific requests without scripts, paths, partition or zoom controls", () => {
    expectTypeOf<Parameters<DesktopBrowser.Bridge["attach"]>>().toEqualTypeOf<
      [workspaceId: string]
    >();
    expectTypeOf<Parameters<DesktopBrowser.Bridge["create"]>>().toEqualTypeOf<
      [request: DesktopBrowser.Create]
    >();
    expectTypeOf<
      Parameters<DesktopBrowser.Bridge["openExternal"]>
    >().toEqualTypeOf<[request: DesktopBrowser.Target]>();
    expectTypeOf<keyof DesktopBrowser.Layout>().toEqualTypeOf<
      "sequence" | "rect" | "visible" | "borderRadius"
    >();
    expectTypeOf<keyof DesktopBrowser.Target>().toEqualTypeOf<
      "attachmentId" | "pageId"
    >();
    expectTypeOf<
      Awaited<ReturnType<DesktopBrowser.Bridge["snapshot"]>>
    >().toEqualTypeOf<DesktopBrowser.Snapshot>();
  });
});

describe("DesktopBrowser URL admission", () => {
  it("canonicalizes absolute HTTP and HTTPS URLs without inventing a scheme", () => {
    expect(DesktopBrowser.normalizeUrl("HTTPS://EXAMPLE.COM:443/a?q=x#y")).toBe(
      "https://example.com/a?q=x#y"
    );
    expect(DesktopBrowser.normalizeUrl("http://localhost:3000/")).toBe(
      "http://localhost:3000/"
    );
    expect(DesktopBrowser.normalizeUrl("https://example.com/🐈")).toBe(
      "https://example.com/%F0%9F%90%88"
    );
  });

  it.each([
    undefined,
    null,
    "",
    "example.com",
    "/desktop",
    "about:blank",
    "file:///tmp/secret",
    "javascript:alert(1)",
    "data:text/html,hi",
    "grida://auth",
    "https://user:pass@example.com",
    "https://user@example.com",
    "https://@example.com",
    "https:///example.com",
    "https://example.com\\@other.com",
    " https://example.com",
    "https://example.com\n",
    "https://exa\tmple.com",
    "https://example.com/\uD800",
    "https://example.com:99999",
    "https://example.com/" + "a".repeat(8192),
  ])(
    "refuses a non-web, credentialed or malformed destination: %j",
    (input) => {
      expect(DesktopBrowser.normalizeUrl(input)).toBeNull();
    }
  );
});

describe("DesktopBrowser layout admission", () => {
  const layout: DesktopBrowser.Layout = {
    sequence: 1,
    visible: true,
    rect: { x: -10.5, y: 120, width: 1000.25, height: 600 },
  };

  it("preserves finite CSS pixels and accepts a hidden zero-size viewport", () => {
    expect(DesktopBrowser.parseLayout(layout)).toEqual(layout);
    expect(
      DesktopBrowser.parseLayout({
        sequence: 2,
        visible: false,
        rect: { x: 0, y: 0, width: 0, height: 0 },
      })
    ).not.toBeNull();
    expect(Object.isFrozen(DesktopBrowser.parseLayout(layout)?.rect)).toBe(
      true
    );
  });

  it("refuses invalid revisions, unbounded geometry and caller-owned zoom", () => {
    for (const sequence of [
      0,
      -1,
      1.5,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(DesktopBrowser.parseLayout({ ...layout, sequence })).toBeNull();
    }
    for (const [key, value] of [
      ["x", Infinity],
      ["y", NaN],
      ["x", 1_000_001],
      ["y", -1_000_001],
      ["width", -1],
      ["height", 16385],
    ] as const) {
      expect(
        DesktopBrowser.parseLayout({
          ...layout,
          rect: { ...layout.rect, [key]: value },
        })
      ).toBeNull();
    }
    expect(DesktopBrowser.parseLayout({ ...layout, zoom: 2 })).toBeNull();
    expect(
      DesktopBrowser.parseLayout({
        ...layout,
        rect: { ...layout.rect, windowId: "other" },
      })
    ).toBeNull();
  });

  it("preserves omitted radius for existing rectangular layouts", () => {
    const parsed = DesktopBrowser.parseLayout(layout);
    expect(parsed).toEqual(layout);
    expect(parsed).not.toHaveProperty("borderRadius");
    expect(
      DesktopBrowser.parseLayout({ ...layout, borderRadius: undefined })
    ).toEqual(layout);
    expectTypeOf<DesktopBrowser.Layout["borderRadius"]>().toEqualTypeOf<
      number | undefined
    >();
  });

  it("round-trips fractional, zero and maximum viewport corner radii", () => {
    for (const borderRadius of [0, 7.75, 8192]) {
      const rounded: DesktopBrowser.Layout = { ...layout, borderRadius };
      const parsed = DesktopBrowser.parseLayout(
        JSON.parse(JSON.stringify(rounded))
      );
      expect(parsed).toEqual(rounded);
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(Object.isFrozen(parsed?.rect)).toBe(true);
    }
    // Radius is presentation input; native applies the dimension clamp.
    expect(
      DesktopBrowser.parseLayout({
        sequence: 2,
        visible: false,
        rect: { x: 0, y: 0, width: 0, height: 0 },
        borderRadius: 7.75,
      })
    ).not.toBeNull();
  });

  it("refuses malformed or unbounded corner radii and unsupported clip geometry", () => {
    for (const borderRadius of [
      -1,
      NaN,
      Infinity,
      -Infinity,
      8192.01,
      "8px",
      null,
      {},
      [],
      { topLeft: 8 },
    ])
      expect(
        DesktopBrowser.parseLayout({ ...layout, borderRadius })
      ).toBeNull();
    expect(
      DesktopBrowser.parseLayout({
        ...layout,
        clip: { rect: layout.rect, borderRadius: 8 },
      })
    ).toBeNull();
    expect(
      DesktopBrowser.parseLayout({ ...layout, borderRadius: 8, zoom: 2 })
    ).toBeNull();
    expect(
      DesktopBrowser.parseLayout({
        ...layout,
        borderRadius: 8,
        rect: { ...layout.rect, height: NaN },
      })
    ).toBeNull();
  });
});

// A generated 1-by-1 solid-color JPEG. No website or personal pixels are retained.
const solidJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAaADAAQAAAABAAAAAQAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A4+iiiv6sP5rP/9k=",
  "base64"
);
const thumbnail = (
  bytes = solidJpeg,
  width = 1,
  height = 1
): DesktopBrowser.Thumbnail => ({
  dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`,
  width,
  height,
});

describe("DesktopBrowser viewport thumbnails", () => {
  it("keeps the presentation read independently optional on version-one hosts", () => {
    const older: Pick<DesktopBrowser.Bridge, "thumbnail"> = {};
    expect(older.thumbnail).toBeUndefined();
    expectTypeOf<
      Parameters<NonNullable<DesktopBrowser.Bridge["thumbnail"]>>
    >().toEqualTypeOf<[request: DesktopBrowser.Target]>();
    expectTypeOf<
      Awaited<ReturnType<NonNullable<DesktopBrowser.Bridge["thumbnail"]>>>
    >().toEqualTypeOf<DesktopBrowser.Thumbnail | null>();
    expectTypeOf<keyof DesktopBrowser.Thumbnail>().toEqualTypeOf<
      "dataUrl" | "width" | "height"
    >();
    expect(DesktopBrowser.VERSION).toBe(1);
  });

  it("accepts and freezes the bounded JPEG display projection", () => {
    const result = DesktopBrowser.parseThumbnail(
      JSON.parse(JSON.stringify(thumbnail()))
    );
    expect(result).toEqual(thumbnail());
    expect(Object.isFrozen(result)).toBe(true);
    expect(DesktopBrowser.parseThumbnail(null)).toBeNull();
    expect(
      DesktopBrowser.parseThumbnail({
        ...thumbnail(),
        path: "/tmp/preview.jpg",
      })
    ).toBeNull();
  });

  it("requires positive bounded integer dimensions matching the encoded frame", () => {
    for (const width of [0, -1, 1.5, NaN, Infinity, 321])
      expect(
        DesktopBrowser.parseThumbnail({ ...thumbnail(), width })
      ).toBeNull();
    for (const height of [0, -1, 1.5, NaN, Infinity, 181])
      expect(
        DesktopBrowser.parseThumbnail({ ...thumbnail(), height })
      ).toBeNull();
    expect(
      DesktopBrowser.parseThumbnail(thumbnail(solidJpeg, 2, 1))
    ).toBeNull();
    const oversizedFrame = Buffer.from(solidJpeg);
    const frame = oversizedFrame.indexOf(Buffer.from([0xff, 0xc0]));
    expect(frame).toBeGreaterThan(0);
    oversizedFrame.writeUInt16BE(10000, frame + 7);
    expect(DesktopBrowser.parseThumbnail(thumbnail(oversizedFrame))).toBeNull();
  });

  it("accepts at most 64 KiB of encoded image bytes", () => {
    const padding = Buffer.alloc(
      DesktopBrowser.MAX_THUMBNAIL_BYTES - solidJpeg.length
    );
    padding[0] = 0xff;
    padding[1] = 0xef; // An ignored application segment leaves the image unchanged.
    padding.writeUInt16BE(padding.length - 2, 2);
    const maximum = Buffer.concat([
      solidJpeg.subarray(0, 2),
      padding,
      solidJpeg.subarray(2),
    ]);
    expect(maximum.length).toBe(DesktopBrowser.MAX_THUMBNAIL_BYTES);
    expect(DesktopBrowser.parseThumbnail(thumbnail(maximum))).not.toBeNull();
    expect(
      DesktopBrowser.parseThumbnail(
        thumbnail(
          Buffer.concat([
            maximum.subarray(0, -2),
            Buffer.from([0]),
            maximum.subarray(-2),
          ])
        )
      )
    ).toBeNull();
    expect(
      DesktopBrowser.parseThumbnail({
        ...thumbnail(),
        dataUrl: `data:image/jpeg;base64,${"A".repeat(4 * Math.ceil(DesktopBrowser.MAX_THUMBNAIL_BYTES / 3) + 4)}`,
      })
    ).toBeNull();
  });

  it("refuses remote images, other formats and malformed or noncanonical base64", () => {
    const valid = thumbnail().dataUrl;
    for (const dataUrl of [
      "https://example.com/preview.jpg",
      valid.replace("image/jpeg", "image/png"),
      valid.replace("image/jpeg", "text/html"),
      valid.replace("base64,", "base64,\n"),
      valid + "=",
      valid.slice(0, -2) + "l=", // Nonzero padding bits must not create an alias.
      "data:image/jpeg;base64,",
      "data:image/jpeg;base64,%%%%",
    ])
      expect(
        DesktopBrowser.parseThumbnail({ ...thumbnail(), dataUrl })
      ).toBeNull();
    expect(
      DesktopBrowser.parseThumbnail(
        thumbnail(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      )
    ).toBeNull();
  });

  it("refuses truncated framing and invalid JPEG segment lengths", () => {
    expect(
      DesktopBrowser.parseThumbnail(thumbnail(solidJpeg.subarray(0, -2)))
    ).toBeNull();
    expect(
      DesktopBrowser.parseThumbnail(
        thumbnail(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
      )
    ).toBeNull();
    const invalid = Buffer.from(solidJpeg);
    invalid.writeUInt16BE(1, 4);
    expect(DesktopBrowser.parseThumbnail(thumbnail(invalid))).toBeNull();
  });
});

describe("DesktopBrowser page outcomes", () => {
  it("distinguishes a blank page from a failed web navigation", () => {
    expect(DesktopBrowser.parsePage(page({ url: null, title: "" }))).toEqual(
      page({ url: null, title: "" })
    );
    const failed = page({
      failure: {
        kind: "navigation",
        code: "ERR_CONNECTION_REFUSED",
        message: "The page could not be reached.",
      },
    });
    expect(DesktopBrowser.parsePage(failed)).toEqual(failed);
    expect(DesktopBrowser.parsePage(page({ url: "about:blank" }))).toBeNull();
    expect(DesktopBrowser.parsePage(page({ url: "" }))).toBeNull();
  });

  it("bounds untrusted UTF-8 metadata and refuses native implementation details", () => {
    expect(
      DesktopBrowser.parsePage(page({ title: "a".repeat(1024) }))
    ).not.toBeNull();
    expect(
      DesktopBrowser.parsePage(page({ title: "é".repeat(513) }))
    ).toBeNull();
    expect(
      DesktopBrowser.parsePage(page({ title: "<script>not markup</script>" }))
    ).not.toBeNull();
    expect(
      DesktopBrowser.parsePage(page({ title: "title\u0000suffix" }))
    ).toBeNull();
    expect(
      DesktopBrowser.parsePage({ ...page(), webContentsId: 1 })
    ).toBeNull();
    expect(
      DesktopBrowser.parseFailure({
        kind: "navigation",
        code: "failed",
        message: "x".repeat(2049),
      })
    ).toBeNull();
    expect(
      DesktopBrowser.parseFailure({
        kind: "navigation",
        code: "failed",
        message: "Safe",
        stack: "native stack",
      })
    ).toBeNull();
    expect(
      DesktopBrowser.parseFailure({
        kind: "navigation",
        code: "",
        message: "Safe",
      })
    ).toBeNull();
  });

  it("requires positive safe page revisions and opaque syntax-only identities", () => {
    for (const revision of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(DesktopBrowser.parsePage(page({ revision }))).toBeNull();
    for (const id of [
      "",
      "/tmp/page",
      "https://host",
      "id with spaces",
      "x".repeat(129),
    ])
      expect(DesktopBrowser.parsePage(page({ id }))).toBeNull();
    expect(DesktopBrowser.isIdentity("native_issued-id")).toBe(true);
  });
});

describe("DesktopBrowser authoritative state", () => {
  it("accepts an empty owner at revision zero and freezes bounded snapshots", () => {
    expect(
      DesktopBrowser.parseSnapshot({ ...snapshot([]), revision: 0 })
    ).not.toBeNull();
    const parsed = DesktopBrowser.parseSnapshot(snapshot());
    expect(parsed).toEqual(snapshot());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.pages)).toBe(true);
    expect(Object.isFrozen(parsed?.pages[0])).toBe(true);
  });

  it("refuses future page revisions, duplicates, multiple focused pages and oversized owners", () => {
    expect(
      DesktopBrowser.parseSnapshot(snapshot([page({ revision: 2 })]))
    ).toBeNull();
    expect(DesktopBrowser.parseSnapshot(snapshot([page(), page()]))).toBeNull();
    expect(
      DesktopBrowser.parseSnapshot(
        snapshot([
          page({ focused: true }),
          page({ id: "page-2", focused: true }),
        ])
      )
    ).toBeNull();
    expect(
      DesktopBrowser.parseSnapshot(
        snapshot(
          Array.from({ length: 17 }, (_, i) => page({ id: `page-${i}` }))
        )
      )
    ).toBeNull();
    expect(
      DesktopBrowser.parseSnapshot({ ...snapshot(), version: 2 })
    ).toBeNull();
    expect(
      DesktopBrowser.parseSnapshot({ ...snapshot(), ownerWindowId: 5 })
    ).toBeNull();
  });

  it("binds changed outcomes to their exact owner revision and keeps closure explicit", () => {
    const changed: DesktopBrowser.Event = {
      type: "changed",
      attachmentId: "attachment-1",
      revision: 1,
      page: page(),
    };
    const closed: DesktopBrowser.Event = {
      type: "closed",
      attachmentId: "attachment-1",
      revision: 2,
      pageId: "page-1",
    };
    expect(DesktopBrowser.parseEvent(changed)).toEqual(changed);
    expect(DesktopBrowser.parseEvent(closed)).toEqual(closed);
    expect(DesktopBrowser.parseEvent({ ...changed, revision: 2 })).toBeNull();
    expect(DesktopBrowser.parseEvent({ ...closed, revision: 0 })).toBeNull();
    expect(
      DesktopBrowser.parseEvent({ ...closed, attachmentId: "/other/owner" })
    ).toBeNull();
    expect(
      DesktopBrowser.parseEvent({ ...closed, nativeEvent: "destroyed" })
    ).toBeNull();
  });
});

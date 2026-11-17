// GRIDA-SEC-016 — bounded native browser contract and destination pins.
import { describe, expect, expectTypeOf, it } from "vitest";
import { DesktopBrowser, DESKTOP_BRIDGE_PROTOCOL } from "./index";
import type { DesktopBridge, DesktopNativeCapabilities } from "./index";

const page = (
  overrides: Partial<DesktopBrowser.Page> = {}
): DesktopBrowser.Page => ({
  id: "page-1",
  mounted: true,
  revision: 1,
  url: "https://example.com/",
  title: "Example",
  loading: false,
  canGoBack: false,
  canGoForward: false,
  focused: false,
  failure: null,
  ...overrides,
});

const snapshot = (
  pages: readonly DesktopBrowser.Page[] = [page()]
): DesktopBrowser.Snapshot => ({
  version: 4,
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
    expect(DesktopBrowser.VERSION).toBe(4);
    expectTypeOf<DesktopBridge["browser"]>().toEqualTypeOf<
      DesktopBrowser.Bridge | undefined
    >();
  });

  it("requires an argument-free globally confirmed clear without scoped aliases", () => {
    expectTypeOf<DesktopBrowser.Bridge["clearBrowsingData"]>().toEqualTypeOf<
      () => Promise<boolean>
    >();
    expectTypeOf<
      Parameters<DesktopBrowser.Bridge["clearBrowsingData"]>
    >().toEqualTypeOf<[]>();
    expectTypeOf<
      Extract<
        keyof DesktopBrowser.Bridge,
        "clearSession" | "clearWorkspaceData"
      >
    >().toEqualTypeOf<never>();
    expect(DesktopBrowser.VERSION).toBe(4);
  });

  it("creates pages without storage selectors and permits an omitted blank URL", () => {
    const blank: DesktopBrowser.Create = { attachmentId: "attachment-1" };
    expect(blank).not.toHaveProperty("url");
    expectTypeOf<keyof DesktopBrowser.Create>().toEqualTypeOf<
      "attachmentId" | "url"
    >();
    expectTypeOf<DesktopBrowser.Navigate["url"]>().toEqualTypeOf<string>();
    expectTypeOf<
      Extract<
        keyof DesktopBrowser.Page,
        "storageScope" | "partition" | "profile"
      >
    >().toEqualTypeOf<never>();
    expect(DesktopBrowser).not.toHaveProperty("isStorageScope");
    for (const storageScope of ["workspace", "ephemeral"])
      expect(DesktopBrowser.parsePage({ ...page(), storageScope })).toBeNull();
  });

  it("exposes purpose-specific requests without scripts, paths or partition controls", () => {
    expectTypeOf<Parameters<DesktopBrowser.Bridge["attach"]>>().toEqualTypeOf<
      [workspaceId: string]
    >();
    expectTypeOf<Parameters<DesktopBrowser.Bridge["create"]>>().toEqualTypeOf<
      [request: DesktopBrowser.Create]
    >();
    expectTypeOf<
      Parameters<DesktopBrowser.Bridge["openExternal"]>
    >().toEqualTypeOf<[request: DesktopBrowser.Target]>();
    expectTypeOf<
      DesktopBrowser.Bridge["presentation"]
    >().toEqualTypeOf<"webview">();
    expectTypeOf<
      Parameters<DesktopBrowser.Bridge["reserveMount"]>
    >().toEqualTypeOf<[request: DesktopBrowser.Target]>();
    expectTypeOf<
      Awaited<ReturnType<DesktopBrowser.Bridge["reserveMount"]>>
    >().toEqualTypeOf<DesktopBrowser.GuestMount>();
    expectTypeOf<
      Parameters<DesktopBrowser.Bridge["setActive"]>
    >().toEqualTypeOf<
      [request: DesktopBrowser.Target & Readonly<{ active: boolean }>]
    >();
    expectTypeOf<
      Extract<
        keyof DesktopBrowser.Bridge,
        "layout" | "adoptWebContents" | "executeJavaScript" | "debugger"
      >
    >().toEqualTypeOf<never>();
    expectTypeOf<keyof DesktopBrowser.Target>().toEqualTypeOf<
      "attachmentId" | "pageId"
    >();
    expectTypeOf<
      Awaited<ReturnType<DesktopBrowser.Bridge["snapshot"]>>
    >().toEqualTypeOf<DesktopBrowser.Snapshot>();
    expectTypeOf<
      Awaited<ReturnType<DesktopBrowser.Bridge["close"]>>
    >().toEqualTypeOf<boolean>();
  });
});

describe("DesktopBrowser.History", () => {
  const entry: DesktopBrowser.History.Entry = {
    url: "https://example.com/",
    title: "Example",
    lastVisitedAt: 1_790_000_000_000,
  };
  const historySnapshot = (
    entries: readonly DesktopBrowser.History.Entry[] = [entry]
  ): DesktopBrowser.History.Snapshot => ({
    version: 1,
    revision: 7,
    entries,
  });

  it("keeps shared history optional and independent of page and event projections", () => {
    const older: Pick<DesktopBrowser.Bridge, "history"> = {};
    expect(older.history).toBeUndefined();
    expect(DesktopBrowser.VERSION).toBe(4);
    expect(DesktopBrowser.History.VERSION).toBe(1);
    expectTypeOf<DesktopBrowser.Bridge["history"]>().toEqualTypeOf<
      DesktopBrowser.History.Bridge | undefined
    >();
    expectTypeOf<keyof DesktopBrowser.History.Bridge>().toEqualTypeOf<
      "version" | "query" | "remove" | "subscribe"
    >();
    expectTypeOf<
      Parameters<DesktopBrowser.History.Bridge["query"]>
    >().toEqualTypeOf<[request: DesktopBrowser.History.Query]>();
    expectTypeOf<
      Awaited<ReturnType<DesktopBrowser.History.Bridge["query"]>>
    >().toEqualTypeOf<DesktopBrowser.History.Snapshot>();
    expectTypeOf<
      Parameters<DesktopBrowser.History.Bridge["remove"]>
    >().toEqualTypeOf<[request: DesktopBrowser.History.Removal]>();
    expectTypeOf<keyof DesktopBrowser.History.Entry>().toEqualTypeOf<
      "url" | "title" | "lastVisitedAt"
    >();
    expect(DesktopBrowser.parsePage({ ...page(), history: entry })).toBeNull();
    expect(
      DesktopBrowser.parseEvent({ type: "history-changed", revision: 7 })
    ).toBeNull();
  });

  it("accepts bounded immutable recent and text queries without choosing authority", () => {
    for (const query of ["", "   ", "Example", " https://example.com/ "])
      expect(DesktopBrowser.History.parseQuery({ query, limit: 10 })).toEqual({
        query,
        limit: 10,
      });
    const parsed = DesktopBrowser.History.parseQuery({
      query: "é".repeat(256),
      limit: DesktopBrowser.History.MAX_RESULTS,
    });
    expect(parsed).not.toBeNull();
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it.each([
    null,
    [],
    {},
    { query: "", limit: 0 },
    { query: "", limit: -1 },
    { query: "", limit: 1.5 },
    { query: "", limit: 101 },
    { query: "", limit: Infinity },
    { query: "", limit: "10" },
    { query: "a".repeat(513), limit: 1 },
    { query: "é".repeat(257), limit: 1 },
    { query: "line\nbreak", limit: 1 },
    { query: "\uD800", limit: 1 },
    { query: "", limit: 1, workspaceId: "other" },
    { query: "", limit: 1, partition: "persist:app" },
    { query: "", limit: 1, path: "/private/history" },
    { query: "", limit: 1, remote: true },
  ])(
    "rejects malformed, oversized or authority-bearing queries: %j",
    (input) => {
      expect(DesktopBrowser.History.parseQuery(input)).toBeNull();
    }
  );

  it("accepts canonical immutable entries with bounded titles and visit times", () => {
    const parsed = DesktopBrowser.History.parseEntry(entry);
    expect(parsed).toEqual(entry);
    expect(parsed).not.toBe(entry);
    expect(Object.isFrozen(parsed)).toBe(true);
    for (const lastVisitedAt of [0, 8_640_000_000_000_000])
      expect(
        DesktopBrowser.History.parseEntry({
          ...entry,
          title: "é".repeat(512),
          lastVisitedAt,
        })
      ).not.toBeNull();
  });

  it("rejects unsafe and noncanonical exact URL identities in entries and removals", () => {
    for (const url of [
      undefined,
      "",
      "example.com",
      "https://example.com",
      "HTTPS://EXAMPLE.COM/",
      "https://example.com:443/",
      "https://example.com/🐈",
      "https://user:pass@example.com/",
      "https://@example.com/",
      "https://example.com\\@other.com",
      "https://example.com/\n",
      "https://example.com/" + "a".repeat(8192),
      "javascript:alert(1)",
      "file:///private/history",
      "data:text/html,hello",
      "about:blank",
    ]) {
      expect(DesktopBrowser.History.parseEntry({ ...entry, url })).toBeNull();
      expect(DesktopBrowser.History.parseRemoval({ url })).toBeNull();
    }
    for (const url of [
      entry.url,
      "http://localhost:3000/",
      "https://example.com/%F0%9F%90%88?q=one#two",
    ]) {
      const parsed = DesktopBrowser.History.parseRemoval({ url });
      expect(parsed).toEqual({ url });
      expect(Object.isFrozen(parsed)).toBe(true);
    }
  });

  it("rejects malformed metadata and additional fields instead of exposing native state", () => {
    for (const override of [
      { title: null },
      { title: "a".repeat(1025) },
      { title: "é".repeat(513) },
      { title: "line\nbreak" },
      { title: "\uD800" },
      { lastVisitedAt: "2026-11-17" },
      { lastVisitedAt: -1 },
      { lastVisitedAt: 1.5 },
      { lastVisitedAt: NaN },
      { lastVisitedAt: Infinity },
      { lastVisitedAt: 8_640_000_000_000_001 },
      { lastVisitedAt: Number.MAX_SAFE_INTEGER + 1 },
      { id: "guest-1" },
      { partition: "persist:app" },
      { path: "/private/history" },
      { faviconUrl: "https://example.com/icon.png" },
      { visitCount: 1 },
    ])
      expect(
        DesktopBrowser.History.parseEntry({ ...entry, ...override })
      ).toBeNull();
    expect(DesktopBrowser.History.parseEntry(null)).toBeNull();
    expect(DesktopBrowser.History.parseEntry({})).toBeNull();
    expect(
      DesktopBrowser.History.parseRemoval({ url: entry.url, pageId: "guest-1" })
    ).toBeNull();
  });

  it("accepts atomic immutable snapshots in descending visit and deterministic URL order", () => {
    const entries = [
      { ...entry, url: "https://a.example/" },
      { ...entry, url: "https://b.example/" },
      { ...entry, lastVisitedAt: entry.lastVisitedAt - 1 },
    ];
    const parsed = DesktopBrowser.History.parseSnapshot(
      historySnapshot(entries)
    );
    expect(parsed).toEqual(historySnapshot(entries));
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.entries)).toBe(true);
    expect(parsed?.entries.every(Object.isFrozen)).toBe(true);
    entries.pop();
    expect(parsed?.entries).toHaveLength(3);
    expect(
      DesktopBrowser.History.parseSnapshot({
        version: 1,
        revision: 0,
        entries: [],
      })
    ).not.toBeNull();
    expect(
      DesktopBrowser.History.parseSnapshot(
        historySnapshot(
          Array.from(
            { length: DesktopBrowser.History.MAX_RESULTS },
            (_, i) => ({
              ...entry,
              lastVisitedAt: entry.lastVisitedAt - i,
              url: `https://example.com/${i}`,
            })
          )
        )
      )
    ).not.toBeNull();
  });

  it("rejects oversized, duplicate, unordered, unversioned or authority-bearing snapshots", () => {
    for (const entries of [
      [entry, entry],
      [
        entry,
        {
          ...entry,
          url: "https://other.example/",
          lastVisitedAt: entry.lastVisitedAt + 1,
        },
      ],
      [
        { ...entry, url: "https://b.example/" },
        { ...entry, url: "https://a.example/" },
      ],
      Array.from(
        { length: DesktopBrowser.History.MAX_RESULTS + 1 },
        () => entry
      ),
    ])
      expect(
        DesktopBrowser.History.parseSnapshot(historySnapshot(entries))
      ).toBeNull();
    for (const override of [
      { version: undefined },
      { version: 2 },
      { revision: -1 },
      { revision: 1.5 },
      { revision: Number.MAX_SAFE_INTEGER + 1 },
      { entries: {} },
      { entries: [null] },
      { attachmentId: "foreign" },
    ])
      expect(
        DesktopBrowser.History.parseSnapshot({
          ...historySnapshot(),
          ...override,
        })
      ).toBeNull();
  });

  it("accepts positive collection invalidations without page or private metadata", () => {
    const parsed = DesktopBrowser.History.parseChange({ revision: 7 });
    expect(parsed).toEqual({ revision: 7 });
    expect(Object.isFrozen(parsed)).toBe(true);
    for (const input of [
      null,
      {},
      { revision: 0 },
      { revision: -1 },
      { revision: 1.5 },
      { revision: Number.MAX_SAFE_INTEGER + 1 },
      { revision: 7, url: entry.url },
      { revision: 7, attachmentId: "foreign" },
      { revision: 7, type: "changed" },
    ])
      expect(DesktopBrowser.History.parseChange(input)).toBeNull();
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

describe("DesktopBrowser live locations", () => {
  it("accepts bounded generated locations without extending persistable web destinations", () => {
    expect(DesktopBrowser.normalizeLocation(null)).toBeNull();
    for (const url of [
      "about:blank",
      "about:blank#preview",
      "about:srcdoc",
      "about:srcdoc?test=one#two",
      "blob:https://example.com/opaque-document",
      "blob:http://localhost:3000/generated-id",
      "blob:null/62532623-cdbc-4aca-bd0a-6d8c3b7a5014",
      "data:text/html,<p>ordinary generated content</p>",
      "data:application/pdf;base64,AAAA",
      "data:",
    ]) {
      expect(DesktopBrowser.normalizeLocation(url)).toBe(url);
      expect(DesktopBrowser.parsePage(page({ url }))).not.toBeNull();
      expect(DesktopBrowser.normalizeUrl(url)).toBeNull();
      expect(DesktopBrowser.History.parseRemoval({ url })).toBeNull();
      expect(
        DesktopBrowser.History.parseEntry({ url, title: "", lastVisitedAt: 0 })
      ).toBeNull();
    }
    expect(DesktopBrowser.normalizeLocation("HTTPS://EXAMPLE.COM:443/a")).toBe(
      "https://example.com/a"
    );
    expect(
      DesktopBrowser.normalizeLocation("blob:HTTPS://EXAMPLE.COM:443/document")
    ).toBe("blob:https://example.com/document");
  });

  it("rejects private schemes, credentialed origins, mount claims and unbounded metadata", () => {
    for (const url of [
      undefined,
      "",
      "example.com",
      "file:///private/document",
      "javascript:alert(1)",
      "grida://private",
      "devtools://inspector",
      "chrome://settings",
      "about:config",
      "about:blank/extra",
      `${DesktopBrowser.MOUNT_URL_PREFIX}native-claim`,
      "blob:file:///private/file",
      "blob:grida://private/document",
      "blob:https://user:pass@example.com/document",
      "blob:https://example.com",
      "blob:https://example.com/",
      "blob:null/",
      "blob:null/one/two",
      "blob:null/" + "x".repeat(129),
      "data:text/html",
      "data:text/html,\uD800",
      "data:text/html,line\nbreak",
      " data:text/html,hello",
      "data:text/html,hello ",
      "data:," + "é".repeat(4094),
    ]) {
      expect(DesktopBrowser.normalizeLocation(url)).toBeNull();
      expect(DesktopBrowser.parsePage({ ...page(), url })).toBeNull();
    }
    expect(
      DesktopBrowser.normalizeLocation("data:," + "a".repeat(8186))
    ).not.toBeNull();
  });
});

describe("DesktopBrowser optional page utilities", () => {
  const find: DesktopBrowser.Utilities.Find = {
    attachmentId: "attachment-1",
    pageId: "page-1",
    text: "Example",
    forward: true,
    findNext: false,
    matchCase: false,
  };
  const zoom: DesktopBrowser.Utilities.Zoom = {
    attachmentId: "attachment-1",
    pageId: "page-1",
    factor: 1,
  };

  it("keeps purpose-specific utilities independently optional and versioned", () => {
    const older: Pick<DesktopBrowser.Bridge, "utilities"> = {};
    expect(older.utilities).toBeUndefined();
    expect(DesktopBrowser.Utilities.VERSION).toBe(1);
    expectTypeOf<keyof DesktopBrowser.Utilities.Bridge>().toEqualTypeOf<
      | "version"
      | "find"
      | "stopFind"
      | "getZoom"
      | "setZoom"
      | "print"
      | "inspect"
    >();
    expectTypeOf<
      Parameters<DesktopBrowser.Utilities.Bridge["inspect"]>
    >().toEqualTypeOf<[request: DesktopBrowser.Target]>();
    expectTypeOf<
      Awaited<ReturnType<DesktopBrowser.Utilities.Bridge["find"]>>
    >().toEqualTypeOf<DesktopBrowser.Utilities.FindResult>();
  });

  it("accepts immutable bounded find requests and final result counts", () => {
    const parsed = DesktopBrowser.Utilities.parseFind(find);
    expect(parsed).toEqual(find);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(
      DesktopBrowser.Utilities.parseFind({ ...find, text: "é".repeat(512) })
    ).not.toBeNull();
    for (const result of [
      { matches: 0, activeMatchOrdinal: 0 },
      { matches: 20, activeMatchOrdinal: 0 },
      { matches: 20, activeMatchOrdinal: 20 },
    ]) {
      const parsedResult = DesktopBrowser.Utilities.parseFindResult(result);
      expect(parsedResult).toEqual(result);
      expect(Object.isFrozen(parsedResult)).toBe(true);
    }
  });

  it("rejects malformed find requests, scripts and native result details", () => {
    for (const override of [
      { attachmentId: "/foreign" },
      { pageId: "" },
      { text: "" },
      { text: "é".repeat(513) },
      { text: "one\ntwo" },
      { text: "\uD800" },
      { forward: 1 },
      { findNext: undefined },
      { matchCase: "false" },
      { script: "alert(1)" },
      { options: {} },
    ])
      expect(
        DesktopBrowser.Utilities.parseFind({ ...find, ...override })
      ).toBeNull();
    for (const result of [
      null,
      {},
      { matches: -1, activeMatchOrdinal: 0 },
      { matches: 0, activeMatchOrdinal: 1 },
      { matches: 20, activeMatchOrdinal: 21 },
      { matches: 1.5, activeMatchOrdinal: 0 },
      { matches: Infinity, activeMatchOrdinal: 0 },
      { matches: 1, activeMatchOrdinal: 1, requestId: 1 },
      { matches: 1, activeMatchOrdinal: 1, selectionArea: {} },
    ])
      expect(DesktopBrowser.Utilities.parseFindResult(result)).toBeNull();
  });

  it("bounds zoom factors and refuses arbitrary native options", () => {
    for (const factor of [0.25, 1, 1.5, 5]) {
      expect(DesktopBrowser.Utilities.parseZoomFactor(factor)).toBe(factor);
      const parsed = DesktopBrowser.Utilities.parseZoom({ ...zoom, factor });
      expect(parsed).toEqual({ ...zoom, factor });
      expect(Object.isFrozen(parsed)).toBe(true);
    }
    for (const factor of [null, "1", NaN, Infinity, 0, 0.24, 5.01]) {
      expect(DesktopBrowser.Utilities.parseZoomFactor(factor)).toBeNull();
      expect(
        DesktopBrowser.Utilities.parseZoom({ ...zoom, factor })
      ).toBeNull();
    }
    for (const extra of [{ level: 2 }, { webContentsId: 9 }, { script: "x" }])
      expect(
        DesktopBrowser.Utilities.parseZoom({ ...zoom, ...extra })
      ).toBeNull();
  });
});

describe("DesktopBrowser optional global management", () => {
  const preferences: DesktopBrowser.Management.DownloadPreferences = {
    askBeforeDownload: true,
    directoryName: "Downloads",
  };

  it("keeps management optional with argument-free narrow cleanup and native choosing", () => {
    const older: Pick<DesktopBrowser.Bridge, "management"> = {};
    expect(older.management).toBeUndefined();
    expect(DesktopBrowser.Management.VERSION).toBe(1);
    expectTypeOf<keyof DesktopBrowser.Management.Bridge>().toEqualTypeOf<
      | "version"
      | "clearHistory"
      | "clearCache"
      | "resetPermissions"
      | "downloadPreferences"
      | "setDownloadPrompt"
      | "chooseDownloadDirectory"
      | "openPage"
    >();
    expectTypeOf<
      Parameters<DesktopBrowser.Management.Bridge["clearHistory"]>
    >().toEqualTypeOf<[]>();
    expectTypeOf<
      Parameters<DesktopBrowser.Management.Bridge["clearCache"]>
    >().toEqualTypeOf<[]>();
    expectTypeOf<
      Parameters<DesktopBrowser.Management.Bridge["resetPermissions"]>
    >().toEqualTypeOf<[]>();
    expectTypeOf<
      Parameters<DesktopBrowser.Management.Bridge["chooseDownloadDirectory"]>
    >().toEqualTypeOf<[]>();
  });

  it("keeps new-page intent optional on existing management hosts without target authority", () => {
    const older: Pick<DesktopBrowser.Management.Bridge, "openPage"> = {};
    expect(older.openPage).toBeUndefined();
    expectTypeOf<
      keyof DesktopBrowser.Management.OpenPage
    >().toEqualTypeOf<"url">();
    expectTypeOf<
      Parameters<NonNullable<DesktopBrowser.Management.Bridge["openPage"]>>
    >().toEqualTypeOf<[request: DesktopBrowser.Management.OpenPage]>();
    expectTypeOf<
      Awaited<
        ReturnType<NonNullable<DesktopBrowser.Management.Bridge["openPage"]>>
      >
    >().toEqualTypeOf<boolean>();
    expect(DesktopBrowser.Management.VERSION).toBe(1);
  });

  it("accepts only immutable canonical HTTP(S) new-page destinations", () => {
    for (const url of [
      "https://example.com/",
      "http://localhost:3000/preview?mode=test#one",
      "https://example.com/%F0%9F%90%88",
    ]) {
      const parsed = DesktopBrowser.Management.parseOpenPage({ url });
      expect(parsed).toEqual({ url });
      expect(Object.isFrozen(parsed)).toBe(true);
    }
    for (const url of [
      undefined,
      null,
      "",
      "example.com",
      "https://example.com",
      "HTTPS://EXAMPLE.COM/",
      "https://example.com:443/",
      "https://example.com/🐈",
      "https://user:pass@example.com/",
      "https://@example.com/",
      "https://example.com\\@other.com/",
      "https://example.com/\n",
      "https://example.com/" + "x".repeat(8192),
      "file:///private/document",
      "grida://private",
      "javascript:alert(1)",
      "about:blank",
      "blob:https://example.com/generated",
      "data:text/html,generated",
    ])
      expect(DesktopBrowser.Management.parseOpenPage({ url })).toBeNull();
  });

  it("refuses window, page, path, preload and session selectors in new-page intents", () => {
    for (const extra of [
      { attachmentId: "foreign-attachment" },
      { pageId: "foreign-page" },
      { webContentsId: 1 },
      { windowId: 2 },
      { workspaceId: "other-workspace" },
      { path: "/tmp/document" },
      { preload: "/tmp/preload" },
      { partition: "persist:app" },
      { disposition: "foreground" },
    ])
      expect(
        DesktopBrowser.Management.parseOpenPage({
          url: "https://example.com/",
          ...extra,
        })
      ).toBeNull();
    expect(DesktopBrowser.Management.parseOpenPage(null)).toBeNull();
    expect(DesktopBrowser.Management.parseOpenPage([])).toBeNull();
  });

  it("accepts immutable download choices and a display-only folder basename", () => {
    for (const directoryName of [
      null,
      "Downloads",
      "다운로드",
      "é".repeat(128),
    ]) {
      const parsed = DesktopBrowser.Management.parseDownloadPreferences({
        ...preferences,
        directoryName,
      });
      expect(parsed).toEqual({ ...preferences, directoryName });
      expect(Object.isFrozen(parsed)).toBe(true);
    }
    for (const askBeforeDownload of [true, false]) {
      const parsed = DesktopBrowser.Management.parseDownloadPrompt({
        askBeforeDownload,
      });
      expect(parsed).toEqual({ askBeforeDownload });
      expect(Object.isFrozen(parsed)).toBe(true);
    }
  });

  it("refuses native paths, extra options and malformed preference metadata", () => {
    for (const override of [
      { askBeforeDownload: 1 },
      { directoryName: "" },
      { directoryName: " " },
      { directoryName: "." },
      { directoryName: ".." },
      { directoryName: "/Users/person/Downloads" },
      { directoryName: "C:\\Users\\person\\Downloads" },
      { directoryName: "é".repeat(129) },
      { directoryName: "folder\nname" },
      { directoryName: "\uD800" },
      { directoryPath: "/tmp/downloads" },
      { partition: "persist:app" },
    ])
      expect(
        DesktopBrowser.Management.parseDownloadPreferences({
          ...preferences,
          ...override,
        })
      ).toBeNull();
    for (const value of [
      null,
      {},
      { askBeforeDownload: "false" },
      { askBeforeDownload: false, path: "/tmp/downloads" },
      { askBeforeDownload: true, permissions: ["camera"] },
    ])
      expect(DesktopBrowser.Management.parseDownloadPrompt(value)).toBeNull();
  });
});

describe("DesktopBrowser guest mounts", () => {
  const mount: DesktopBrowser.GuestMount = {
    src: `${DesktopBrowser.MOUNT_URL_PREFIX}native-issued_claim-1`,
  };

  it("accepts only the bounded immutable bootstrap projection", () => {
    const parsed = DesktopBrowser.parseGuestMount(
      JSON.parse(JSON.stringify(mount))
    );
    expect(parsed).toEqual(mount);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(
      DesktopBrowser.parseGuestMount({
        src: `${DesktopBrowser.MOUNT_URL_PREFIX}${"a".repeat(128)}`,
      })
    ).not.toBeNull();
    // Syntax is not native admission; the parser cannot establish who issued a claim.
    expect(DesktopBrowser.normalizeUrl(mount.src)).toBeNull();
  });

  it.each([
    null,
    undefined,
    [],
    {},
    { src: null },
    { src: "" },
    { src: "about:blank" },
    { src: "https://example.com/" },
    { src: "javascript:alert(1)" },
    { src: "file:///tmp/guest" },
    { src: "about:blank#mount=claim" },
    { src: `${DesktopBrowser.MOUNT_URL_PREFIX}` },
    { src: `${DesktopBrowser.MOUNT_URL_PREFIX}${"a".repeat(129)}` },
    { src: `${DesktopBrowser.MOUNT_URL_PREFIX}claim?partition=app` },
    { src: `${DesktopBrowser.MOUNT_URL_PREFIX}claim%2Fother` },
    { src: `${DesktopBrowser.MOUNT_URL_PREFIX}claim\n` },
    { src: `${DesktopBrowser.MOUNT_URL_PREFIX}🐈` },
  ])("refuses a malformed or unbounded bootstrap: %j", (value) => {
    expect(DesktopBrowser.parseGuestMount(value)).toBeNull();
  });

  it("rejects native options, guest IDs and geometry at the mount boundary", () => {
    for (const extra of [
      { webContentsId: 1 },
      { partition: "persist:app" },
      { preload: "/tmp/preload.js" },
      { webPreferences: {} },
      { rect: { x: 0, y: 0, width: 400, height: 300 } },
      { visible: true },
      { borderRadius: 8 },
      { clip: {} },
    ])
      expect(DesktopBrowser.parseGuestMount({ ...mount, ...extra })).toBeNull();
    expect(DesktopBrowser).not.toHaveProperty("parseLayout");
    expect(DesktopBrowser).not.toHaveProperty("MAX_LAYOUT_EDGE");
    expect(DesktopBrowser).not.toHaveProperty("MAX_LAYOUT_POSITION");
  });

  it("requires actual guest presence and represents preguest mount failure honestly", () => {
    expect(
      DesktopBrowser.parsePage(
        page({
          mounted: false,
          failure: {
            kind: "mount",
            code: "timeout",
            message: "The page could not be mounted.",
          },
        })
      )
    ).not.toBeNull();
    expect(DesktopBrowser.parsePage(page({ mounted: true }))).not.toBeNull();
    const { mounted: _missing, ...legacy } = page();
    expect(DesktopBrowser.parsePage(legacy)).toBeNull();
    for (const mounted of [undefined, null, 0, "false"])
      expect(DesktopBrowser.parsePage({ ...page(), mounted })).toBeNull();
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

// Generated solid-color rasters; no website assets or personal data.
const iconPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGNwaDjwHwAFBAKAPJ4DgAAAAABJRU5ErkJggg==",
  "base64"
);
const iconGif = Buffer.from(
  "R0lGODlhAQABAIAAAExpcUCAwCH5BAUAAAAALAAAAAABAAEAAAICTAEAOw==",
  "base64"
);
const iconWebp = Buffer.from(
  "UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAdQwAIVuP+BiOh/AAA=",
  "base64"
);
function iconIco(image = iconPng, dib = false): Buffer {
  const directory = Buffer.alloc(22);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(1, 4);
  directory[6] = 1;
  directory[7] = 1;
  directory.writeUInt16LE(1, 10);
  directory.writeUInt16LE(32, 12);
  if (dib) {
    image = Buffer.alloc(48);
    image.writeUInt32LE(40, 0);
    image.writeUInt32LE(1, 4);
    image.writeUInt32LE(2, 8);
    image.writeUInt16LE(1, 12);
    image.writeUInt16LE(32, 14);
    image[43] = 255;
  }
  directory.writeUInt32LE(image.length, 14);
  directory.writeUInt32LE(directory.length, 18);
  return Buffer.concat([directory, image]);
}
const favicon = (mime: string, bytes: Buffer): DesktopBrowser.Favicon => ({
  dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
});

describe("DesktopBrowser favicons", () => {
  it("keeps icons independently optional without adding image fields to strict page projections", () => {
    const older: Pick<DesktopBrowser.Bridge, "favicon"> = {};
    expect(older.favicon).toBeUndefined();
    expectTypeOf<
      Parameters<NonNullable<DesktopBrowser.Bridge["favicon"]>>
    >().toEqualTypeOf<[request: DesktopBrowser.Target]>();
    expectTypeOf<
      Awaited<ReturnType<NonNullable<DesktopBrowser.Bridge["favicon"]>>>
    >().toEqualTypeOf<DesktopBrowser.Favicon | null>();
    expectTypeOf<keyof DesktopBrowser.Favicon>().toEqualTypeOf<"dataUrl">();
    expect(DesktopBrowser.VERSION).toBe(4);
    expect(DesktopBrowser.parsePage(page())).not.toBeNull();
    expect(
      DesktopBrowser.parsePage({
        ...page(),
        favicon: favicon("image/png", iconPng),
      })
    ).toBeNull();
    expect(
      DesktopBrowser.parseEvent({
        type: "changed",
        attachmentId: "owner",
        revision: 1,
        page: page(),
      })
    ).not.toBeNull();
  });

  it.each([
    ["image/png", iconPng],
    ["image/x-icon", iconIco()],
    ["image/vnd.microsoft.icon", iconIco(undefined, true)],
    ["image/jpeg", solidJpeg],
    ["image/webp", iconWebp],
    ["image/gif", iconGif],
  ])("accepts and freezes a bounded %s icon", (mime, bytes) => {
    const input = favicon(mime, bytes);
    const parsed = DesktopBrowser.parseFavicon(
      JSON.parse(JSON.stringify(input))
    );
    expect(parsed).toEqual(input);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it("rejects remote, executable, private, vector and noncanonical sources", () => {
    for (const dataUrl of [
      "https://example.com/favicon.ico",
      "file:///tmp/icon.png",
      "grida-workspace://private/icon.png",
      "javascript:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      "data:text/html;base64,PGgxPng8L2gxPg==",
      favicon("image/png", Buffer.from("<svg><script>alert(1)</script></svg>"))
        .dataUrl,
      favicon("image/png", solidJpeg).dataUrl,
      favicon("image/png", iconPng).dataUrl + "=",
      favicon("image/png", iconPng).dataUrl.replace("base64,", "base64,\n"),
    ])
      expect(DesktopBrowser.parseFavicon({ dataUrl })).toBeNull();
    expect(DesktopBrowser.parseFavicon(null)).toBeNull();
    expect(
      DesktopBrowser.parseFavicon({
        ...favicon("image/png", iconPng),
        url: "https://example.com",
      })
    ).toBeNull();
  });

  it("rejects oversized bytes and actual raster dimensions", () => {
    expect(
      DesktopBrowser.parseFavicon(
        favicon("image/png", Buffer.alloc(DesktopBrowser.MAX_FAVICON_BYTES + 1))
      )
    ).toBeNull();
    const png = Buffer.from(iconPng);
    png.writeUInt32BE(257, 16);
    expect(DesktopBrowser.parseFavicon(favicon("image/png", png))).toBeNull();
    const jpeg = Buffer.from(solidJpeg);
    jpeg.writeUInt16BE(257, jpeg.indexOf(Buffer.from([0xff, 0xc0])) + 7);
    expect(DesktopBrowser.parseFavicon(favicon("image/jpeg", jpeg))).toBeNull();
    const gif = Buffer.from(iconGif);
    gif.writeUInt16LE(257, 6);
    expect(DesktopBrowser.parseFavicon(favicon("image/gif", gif))).toBeNull();
    const webp = Buffer.from(iconWebp);
    webp.writeUInt32LE(256, 21);
    expect(DesktopBrowser.parseFavicon(favicon("image/webp", webp))).toBeNull();
  });

  it("rejects malformed container bounds and unsupported icon encodings", () => {
    for (const [mime, bytes] of [
      ["image/png", iconPng],
      ["image/gif", iconGif],
      ["image/webp", iconWebp],
      ["image/x-icon", iconIco()],
    ] as const) {
      expect(
        DesktopBrowser.parseFavicon(favicon(mime, bytes.subarray(0, -1)))
      ).toBeNull();
    }
    const offset = iconIco();
    offset.writeUInt32LE(offset.length + 1, 18);
    expect(
      DesktopBrowser.parseFavicon(favicon("image/x-icon", offset))
    ).toBeNull();
    const cursor = iconIco();
    cursor.writeUInt16LE(2, 2);
    expect(
      DesktopBrowser.parseFavicon(favicon("image/x-icon", cursor))
    ).toBeNull();
    expect(
      DesktopBrowser.parseFavicon(
        favicon("image/x-icon", Buffer.from([0, 0, 1, 0]))
      )
    ).toBeNull();
    const compressed = iconIco(undefined, true);
    compressed.writeUInt32LE(1, 22 + 16);
    expect(
      DesktopBrowser.parseFavicon(favicon("image/x-icon", compressed))
    ).toBeNull();
  });

  it("excludes animated raster containers", () => {
    const frame = iconGif.indexOf(0x2c);
    const animatedGif = Buffer.concat([
      iconGif.subarray(0, -1),
      iconGif.subarray(frame, -1),
      Buffer.from([0x3b]),
    ]);
    expect(
      DesktopBrowser.parseFavicon(favicon("image/gif", animatedGif))
    ).toBeNull();
    const animatedPng = Buffer.concat([
      iconPng.subarray(0, 33),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from("acTL"),
      Buffer.alloc(4),
      iconPng.subarray(33),
    ]);
    expect(
      DesktopBrowser.parseFavicon(favicon("image/png", animatedPng))
    ).toBeNull();
    const animatedWebp = Buffer.concat([
      iconWebp,
      Buffer.from("ANIM"),
      Buffer.alloc(4),
    ]);
    animatedWebp.writeUInt32LE(animatedWebp.length - 8, 4);
    expect(
      DesktopBrowser.parseFavicon(favicon("image/webp", animatedWebp))
    ).toBeNull();
  });
});

describe("DesktopBrowser viewport thumbnails", () => {
  it("keeps the presentation read independently optional on version-four hosts", () => {
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
    expect(DesktopBrowser.VERSION).toBe(4);
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
    expect(
      DesktopBrowser.parsePage(page({ url: "about:blank" }))
    ).not.toBeNull();
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
    expect(DesktopBrowser.MAX_PAGES).toBe(64);
    expect(
      DesktopBrowser.parseSnapshot(
        snapshot(
          Array.from({ length: 64 }, (_, i) => page({ id: `page-${i}` }))
        )
      )
    ).not.toBeNull();
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
          Array.from({ length: 65 }, (_, i) => page({ id: `page-${i}` }))
        )
      )
    ).toBeNull();
    for (const version of [1, 2, 3])
      expect(
        DesktopBrowser.parseSnapshot({ ...snapshot(), version })
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

  it("describes native-created pages with opaque opener identity and requested disposition", () => {
    for (const disposition of ["foreground", "background"] as const)
      for (const openerPageId of [null, "opener-page"]) {
        const created: DesktopBrowser.Event = {
          type: "created",
          attachmentId: "attachment-1",
          revision: 1,
          page: page(),
          openerPageId,
          disposition,
        };
        const parsed = DesktopBrowser.parseEvent(created);
        expect(parsed).toEqual(created);
        expect(Object.isFrozen(parsed)).toBe(true);
        expect(
          Object.isFrozen(parsed && "page" in parsed ? parsed.page : undefined)
        ).toBe(true);
      }
  });

  it("refuses malformed creation outcomes without inferring authority from valid identity syntax", () => {
    const created = {
      type: "created",
      attachmentId: "attachment-1",
      revision: 1,
      page: page(),
      openerPageId: "opener-page",
      disposition: "background",
    };
    for (const override of [
      { revision: 2 },
      { openerPageId: "page-1" },
      { openerPageId: 17 },
      { openerPageId: "/foreign/page" },
      { openerPageId: undefined },
      { disposition: "new-window" },
      { disposition: undefined },
      { webContentsId: 17 },
      { windowId: 2 },
      { webPreferences: { preload: "/tmp/preload" } },
    ])
      expect(DesktopBrowser.parseEvent({ ...created, ...override })).toBeNull();
  });
});

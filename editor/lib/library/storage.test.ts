// GRIDA-SEC-004: Pin provider selection and the validated Library image origin.
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryStorage } from "./storage";

const sha256 = "a".repeat(64);
const asset = {
  id: "97eaa44d-848b-4101-9cf8-88325f1c2bf0",
  path: "legacy/asset #1.png",
  sha256,
  mimetype: "image/png",
};

afterEach(() => vi.unstubAllEnvs());

describe("LibraryStorage", () => {
  it("keeps existing Supabase byte and download URLs unless explicitly switched", () => {
    vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_STORAGE_PROVIDER", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co/");
    expect(LibraryStorage.provider()).toBe("supabase");
    expect(LibraryStorage.url(asset)).toBe(
      "https://project.supabase.co/storage/v1/object/public/library/legacy/asset%20%231.png"
    );
    expect(LibraryStorage.download(asset)).toBe(
      `${LibraryStorage.url(asset)}?download=`
    );
  });

  it("preserves local Supabase and legacy rows without recorded hashes", () => {
    vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_STORAGE_PROVIDER", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    expect(LibraryStorage.url({ ...asset, sha256: null })).toBe(
      "http://127.0.0.1:54321/storage/v1/object/public/library/legacy/asset%20%231.png"
    );
  });

  it("uses the public content hash URL for Tigris bytes and downloads", () => {
    vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_STORAGE_PROVIDER", "tigris");
    vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_ASSET_ORIGIN", undefined);
    expect(LibraryStorage.provider()).toBe("tigris");
    expect(LibraryStorage.origin()).toBe("https://library.grida.co");
    expect(LibraryStorage.url(asset)).toBe(
      `https://library.grida.co/${sha256}.png`
    );
    expect(LibraryStorage.download(asset)).toBe(LibraryStorage.url(asset));
  });

  it("does not fall back to a legacy path when Tigris needs a missing hash", () => {
    vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_STORAGE_PROVIDER", "tigris");
    expect(() => LibraryStorage.url({ ...asset, sha256: null })).toThrow(
      /SHA-256/
    );
  });

  it("rejects an unknown provider rather than silently switching storage", () => {
    vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_STORAGE_PROVIDER", "other");
    expect(() => LibraryStorage.provider()).toThrow(/provider/);
  });

  it.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
    ["image/svg+xml", "svg"],
    ["image/avif", "avif"],
  ])("uses the pinned extension for %s", (mimetype, extension) => {
    expect(LibraryStorage.key(sha256, mimetype)).toBe(`${sha256}.${extension}`);
  });

  it.each(["", "A".repeat(64), "a".repeat(63), `${sha256}/image`])(
    "rejects a noncanonical digest: %s",
    (value) => {
      expect(() => LibraryStorage.key(value, "image/png")).toThrow(/SHA-256/);
    }
  );

  it("rejects unsupported media rather than producing an ambiguous key", () => {
    expect(() =>
      LibraryStorage.key(sha256, "application/octet-stream")
    ).toThrow(/media type/);
  });

  it("supports an explicit local object-store origin", () => {
    vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_STORAGE_PROVIDER", "tigris");
    vi.stubEnv(
      "NEXT_PUBLIC_GRIDA_LIBRARY_ASSET_ORIGIN",
      "http://127.0.0.1:9000/"
    );
    expect(LibraryStorage.url(asset)).toBe(
      `http://127.0.0.1:9000/${sha256}.png`
    );
  });

  it.each([
    "http://library.grida.co",
    "https://user:secret@library.grida.co",
    "https://library.grida.co/unexpected",
    "https://library.grida.co?extra=1",
    "https://library.grida.co#fragment",
  ])(
    "rejects an asset origin with extra authority or URL components: %s",
    (url) => {
      vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_STORAGE_PROVIDER", "tigris");
      vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_ASSET_ORIGIN", url);
      expect(() => LibraryStorage.baseUrl()).toThrow(
        "Invalid Library asset origin"
      );
    }
  );
});

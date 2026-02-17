// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureFigmaDefaultFonts,
  FIGMA_DEFAULT_FALLBACK_ORDER,
  FIGMA_DEFAULT_FONT_ENTRIES,
} from "../figma-default-fonts";

describe("figma-default-fonts", () => {
  const addFont = vi.fn();
  const setFallbackFonts = vi.fn();
  const mockCanvas = { addFont, setFallbackFonts } as any;

  beforeEach(() => {
    addFont.mockClear();
    setFallbackFonts.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        })
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exports FIGMA_DEFAULT_FONT_ENTRIES with expected families", () => {
    const families = FIGMA_DEFAULT_FONT_ENTRIES.map((e) => e.family);
    expect(families).toContain("Inter");
    expect(families).toContain("Noto Sans KR");
    expect(families).toContain("Noto Sans JP");
    expect(families).toContain("Noto Sans SC");
    expect(families).toContain("Noto Sans TC");
    expect(families).toContain("Noto Sans HK");
    expect(families).toContain("Noto Color Emoji");
    expect(FIGMA_DEFAULT_FONT_ENTRIES.every((e) => e.url.length > 0)).toBe(
      true
    );
  });

  it("exports FIGMA_DEFAULT_FALLBACK_ORDER matching font entries", () => {
    expect(FIGMA_DEFAULT_FALLBACK_ORDER).toEqual(
      FIGMA_DEFAULT_FONT_ENTRIES.map((e) => e.family)
    );
  });

  it("ensureFigmaDefaultFonts fetches each URL and registers fonts then sets fallback order", async () => {
    await ensureFigmaDefaultFonts(mockCanvas);

    expect(addFont).toHaveBeenCalledTimes(FIGMA_DEFAULT_FONT_ENTRIES.length);
    for (const entry of FIGMA_DEFAULT_FONT_ENTRIES) {
      expect(addFont).toHaveBeenCalledWith(
        entry.family,
        expect.any(Uint8Array)
      );
    }
    expect(setFallbackFonts).toHaveBeenCalledTimes(1);
    expect(setFallbackFonts).toHaveBeenCalledWith(FIGMA_DEFAULT_FALLBACK_ORDER);
  });

  it("ensureFigmaDefaultFonts throws when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 404, statusText: "Not Found" })
      )
    );

    await expect(ensureFigmaDefaultFonts(mockCanvas)).rejects.toThrow(
      /Figma default font fetch failed/
    );
  });
});

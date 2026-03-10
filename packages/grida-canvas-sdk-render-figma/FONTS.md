# Font strategy for @grida/refig (Figma renderer)

This document describes Figma's default font behavior and how this renderer aligns with it so that exported output matches Figma's rendering (where possible).

---

## Figma's default font behavior

Figma uses **platform-agnostic default fonts** and **implicit font fallback**. The fallback chain is not exposed in the Figma API or stored in `.fig` files.

- **Primary font**: Whatever the designer sets (e.g. Caveat, Inter, Roboto). Only this family (and sometimes style) is stored in the file or returned by the API.
- **Fallback**: When the primary font lacks glyphs for some characters, Figma automatically uses a fixed set of default fonts. The **per-character** choice of fallback font is **not** stored and **not** returned in any API or in the `.fig` format.
- **Example**: A text node with font **Caveat** and content `"ABC가나다"` will have only `fontFamily: "Caveat"` (or equivalent) in the document. The Latin "ABC" is drawn with Caveat; the Korean "가나다" is drawn with a Figma platform default (e.g. Noto Sans KR). That Korean run is **implicit**—there is no separate style or font reference for "가나다" in the API or `.fig`; it is simply Figma's platform default behavior.

So for mixed-script text, the **effective** fonts used at render time include both the document font and Figma's default fallback set, even though only the primary font is explicit in the file.

Figma has stated they **fall back only to Noto fonts**, regardless of platform ([Figma: When fonts fall](https://www.figma.com/blog/when-fonts-fall/)). The effective default fallback set (by script) is summarized below. Exact names/order may vary; this table reflects the mapping we align to.

| Script / usage         | Figma default font                  | Note                               |
| ---------------------- | ----------------------------------- | ---------------------------------- |
| Latin, Cyrillic, Greek | Inter                               | Common default for Western         |
| Korean (Hangul, etc.)  | Noto Sans KR                        | CJK fallback                       |
| Japanese (Kana, Kanji) | Noto Sans JP                        | CJK fallback                       |
| Chinese (Simplified)   | Noto Sans SC                        | CJK fallback                       |
| Chinese (Traditional)  | Noto Sans TC                        | Optional; TC/HK variants           |
| Chinese (Hong Kong)    | Noto Sans HK                        | Optional                           |
| Emoji                  | CDN-hosted PNG images (see [Emoji](#emoji)) | Apple emoji style; served from Figma's own CDN |

None of the fallback choices appear in the Figma API or `.fig`; they are implicit at render time.

---

## Aligning this renderer with Figma

To avoid **tofu** (missing glyphs / `.notdef`) and to approximate Figma's behavior, the renderer should **boot with the same config**:

| Step | Action                                                                                                                                        |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Load** the default font set (same families as the table above: Inter + Noto Sans KR/JP/SC, and optionally TC/HK).                           |
| 2    | **Register** each font with the canvas (e.g. `addFont(family, bytes)`).                                                                       |
| 3    | **Set fallback order** (e.g. `setFallbackFonts([...])`) so the canvas uses the same script → font mapping when the primary font lacks glyphs. |

Then any document that relies on implicit fallback (e.g. Caveat + `"ABC가나다"`) will render with the expected CJK font instead of tofu. Family names and order should match Figma where documented or reverse‑engineered.

The built-in implementation uses CDN URLs defined in the package (see `figma-default-fonts.ts`) and does not ship font files in the bundle.

---

## Custom / primary fonts (bring-your-own-font)

**Primary fonts** — those the designer explicitly sets (e.g. Caveat, Roboto, brand typefaces) — are **not** part of the default set. Figma has no font API; the document only stores family names. The renderer cannot fetch these automatically.

**Flow**:

1. **Discover** — `document.listFontFamilies(rootNodeId?)` returns a unique set of font family names used in the document (or a scoped subtree).
2. **Load** — The user loads TTF/OTF bytes for each family from their own source (local FS, CDN, asset service). Skip families in the default fallback set; the renderer loads those.
3. **Register** — Pass `fonts: Record<string, Uint8Array>` to `FigmaRenderer`.

**Current API:** Family names only. The user supplies all font files that match each family (variable or static); the renderer selects the correct instance per text style at render time. For future refinements (postscript name, axes, unicode ranges), see `AGENTS.md`.

---

## Emoji

|              | Figma                                                                                                                                                        | This renderer (@grida/refig)                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **Method**   | **CDN-hosted PNG images** (not a font) — each emoji is a separate PNG fetched from Figma's own CDN                                                           | **Noto Color Emoji** font                                                |
| **Reason**   | Figma hosts emoji as individual PNGs on their own CDN to bypass font licensing (e.g. Apple Color Emoji is proprietary); rendering is consistent across all platforms | We cannot ship Apple/Segoe emoji fonts (license/redistribution).         |
| **Output**   | Consistent across all platforms — Apple emoji visual style, CDN-served PNGs                                                                                 | Fixed (Noto Color Emoji); **visually different from Figma by design**.   |

Figma does **not** use OS/platform emoji fonts. It renders emoji as individual PNG images fetched from its own CDN, which allows it to present the Apple emoji visual style on every platform (macOS, Windows, Linux, browser) without distributing the proprietary font file. Output is therefore **platform-independent**, not OS-dependent.

This renderer uses Noto Color Emoji as a real font instead. The visual appearance differs from Figma's Apple-style PNG emoji, and this is an intentional, documented divergence.

This is the only documented, intentional deviation from Figma's default behavior; the rest of the strategy (Noto for CJK, explicit default set + fallback order) is intended to align with Figma.

---

## Last updated

**2025-02-25** — Added bring-your-own-font flow. Figma's default font set and fallback behavior are unlikely to change often but can change without notice. Re‑check Figma's behavior and docs when doing font-related work.

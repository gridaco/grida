/**
 * Client-side Mac arch detection for the downloads hero.
 *
 * The macOS user-agent reports `Intel Mac OS X` on both Intel and Apple
 * Silicon, so the server default is always arm64 (issue #954). After
 * hydration we classify the WebGL unmasked renderer:
 *
 * - Apple GPU / Apple M… → arm64
 * - Intel / AMD / Radeon → x64
 * - missing, blocked, or unrecognized → inconclusive (keep arm64)
 */
export namespace macarch {
  export type Arch = "arm64" | "x64";

  export function classifyRenderer(
    renderer: string | null | undefined
  ): Arch | null {
    if (!renderer) return null;
    const s = renderer.trim().toLowerCase();
    if (!s) return null;
    // Apple Silicon reports "Apple GPU", "Apple M1", ANGLE Metal "Apple M…".
    // Check Apple first so mixed ANGLE strings don't fall through to Intel.
    if (/\bapple\b/.test(s)) return "arm64";
    if (/\bintel\b/.test(s) || /\bamd\b/.test(s) || /\bradeon\b/.test(s)) {
      return "x64";
    }
    return null;
  }

  export function readWebGLRenderer(): string | null {
    if (typeof document === "undefined") return null;
    try {
      const canvas = document.createElement("canvas");
      const gl =
        canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");
      if (
        !gl ||
        typeof (gl as WebGLRenderingContext).getExtension !== "function"
      ) {
        return null;
      }
      const webgl = gl as WebGLRenderingContext;
      const ext = webgl.getExtension("WEBGL_debug_renderer_info");
      if (!ext) return null;
      const renderer = webgl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      return typeof renderer === "string" && renderer.trim() ? renderer : null;
    } catch {
      return null;
    }
  }

  export function pickHeroUrl(input: {
    os: "mac" | "windows" | "linux" | null;
    defaultUrl: string | null;
    fallbackUrl: string;
    macX64Url: string | null;
    arch: Arch | null;
  }): string {
    const { os, defaultUrl, fallbackUrl, macX64Url, arch } = input;
    if (os === "mac" && arch === "x64" && macX64Url) return macX64Url;
    if (os) return defaultUrl ?? fallbackUrl;
    return fallbackUrl;
  }
}

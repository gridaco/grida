/**
 * Read-only viewers for the workspace file tab.
 *
 * Four rendering paths, all read-only — the workspace pane only
 * ships editing for `.svg` (see `file-tab-svg-editor.tsx`); everything
 * else is "look but don't touch":
 *
 *   - Markdown (.md, .markdown) → Streamdown default rendering.
 *   - Image (.png/.jpg/.gif/.webp/…) / Video (.mp4/.webm/.mov/…) → on desktop,
 *     streamed straight from the `grida-workspace://` privileged scheme (#924):
 *     size-independent, Range-capable (video seeking), no base64. On hosts
 *     without that scheme (web-daemon dev bridge) we fall back to the capped
 *     base64 reader (`readFileBytes` → `<img/video data:…>`).
 *   - Text (everything else) → Shiki-highlighted code block, with
 *     `plaintext` as the language fallback so unrecognised
 *     extensions still render readably.
 *
 * Each viewer owns its own load-state (`useFileText` / `useFileBytes`
 * helpers below). Errors surface inline — the agent sidecar's
 * `file-not-utf8`, `file-too-large`, etc. messages are already
 * human-readable, so we don't try to second-guess them here.
 */
"use client";

import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { AlertCircleIcon } from "lucide-react";
import { Streamdown } from "streamdown";
import { type BundledLanguage, codeToHtml } from "shiki";
import { cn } from "@app/ui/lib/utils";
import { workspaces as workspacesNs } from "@/lib/desktop/bridge";

/* ─────────────────────── shared load helpers ──────────────────── */

type TextState =
  | { kind: "loading" }
  | { kind: "ready"; content: string }
  | { kind: "error"; message: string };

function useFileText(workspaceId: string, relPath: string): TextState {
  const [state, setState] = useState<TextState>({ kind: "loading" });
  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    workspacesNs
      .readFile(workspaceId, relPath)
      .then((r) => {
        if (cancelled) return;
        setState({ kind: "ready", content: r.content });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Couldn't read file.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, relPath]);
  return state;
}

type BytesState =
  | { kind: "loading" }
  | { kind: "ready"; base64: string }
  | { kind: "error"; message: string };

function useFileBytes(workspaceId: string, relPath: string): BytesState {
  const [state, setState] = useState<BytesState>({ kind: "loading" });
  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    workspacesNs
      .readFileBytes(workspaceId, relPath)
      .then((r) => {
        if (cancelled) return;
        setState({ kind: "ready", base64: r.base64 });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Couldn't read file.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, relPath]);
  return state;
}

function LoadingState({ relPath }: { relPath: string }) {
  return (
    <div className="flex h-full items-center justify-center text-xs italic text-muted-foreground">
      Loading {relPath}…
    </div>
  );
}

/** Shown under the error message only on the capped readers (markdown/text and
 * the base64 media fallback). The streamed media path (#924) has no cap, so it
 * passes no hint. */
const SIDECAR_CAP_HINT =
  "The viewer reads files up to 1 MiB. Larger or unreadable files are rejected by the agent sidecar.";

function ErrorState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center gap-2 px-6 text-center">
      <AlertCircleIcon className="size-5 text-destructive" />
      <p className="text-sm text-destructive">{message}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* ─────────────────────────── markdown ─────────────────────────── */

export function MarkdownViewer({
  workspaceId,
  relPath,
}: {
  workspaceId: string;
  relPath: string;
}) {
  const state = useFileText(workspaceId, relPath);
  if (state.kind === "loading") return <LoadingState relPath={relPath} />;
  if (state.kind === "error")
    return <ErrorState message={state.message} hint={SIDECAR_CAP_HINT} />;
  return (
    <div className="h-full w-full overflow-auto bg-background">
      <div className="mx-auto max-w-3xl px-6 py-6">
        <Streamdown>{state.content}</Streamdown>
      </div>
    </div>
  );
}

/* ────────────────────────── binary media ───────────────────────── */

/** Lowercase extension → mime type. Anything not listed falls back
 * to `application/octet-stream`, which means the browser still tries
 * to render the data URL via its own sniffing — usually fine for
 * common formats but not guaranteed. */
const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tiff: "image/tiff",
  tif: "image/tiff",
};

const VIDEO_MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  webm: "video/webm",
  mov: "video/quicktime",
  ogv: "video/ogg",
  ogg: "video/ogg",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  "3gp": "video/3gpp",
  "3g2": "video/3gpp2",
};

function inferMime(relPath: string): string {
  const name = relPath.split("/").pop() ?? relPath;
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  const ext = name.slice(dot + 1).toLowerCase();
  return IMAGE_MIME[ext] ?? VIDEO_MIME[ext] ?? "application/octet-stream";
}

/* ───────────────────────── zoomable image surface ──────────────────────── */

// Per-wheel-unit zoom sensitivity for pinch / Cmd-wheel. Mirrors the
// `@grida/svg-editor` WHEEL_PAN_ZOOM default (src/gestures/defaults.ts).
const WHEEL_ZOOM_SENSITIVITY = 0.01;
// Screen-px breathing room between the fitted image and the pane edge, AND the
// overscroll slack past the edge when zoomed in — the keynote `padding` +
// `pan_overshoot` pair (presets/keynote.ts). At rest the image sits centered
// inside the pane minus this padding.
const PADDING = 32;
const PAN_OVERSHOOT = PADDING;
// Max magnification, in natural image pixels (1 = 100%). The MIN zoom is the
// padded fit, computed per-image.
const MAX_SCALE = 16;
const DOUBLE_CLICK_FACTOR = 2;

/** Measured geometry: container (`c*`) and natural image (`n*`) sizes. */
type Measured = { cw: number; ch: number; nw: number; nh: number };
/** Camera over the natural-size image: screen = natural · scale + (x, y). */
type Camera = { scale: number; x: number; y: number };

/** The "fully zoomed-out" scale: the image fits inside the pane minus PADDING.
 * Capped at 1 so small images rest at ≤100% (no ugly upscaling) — the one
 * deliberate deviation from keynote, which upscales-to-fill. */
function fitScaleOf(m: Measured): number {
  const raw = Math.min(
    (m.cw - 2 * PADDING) / m.nw,
    (m.ch - 2 * PADDING) / m.nh
  );
  return Math.min(raw > 0 ? raw : 1, 1);
}

/** Clamp a camera to the legal range: scale ∈ [paddedFit, MAX_SCALE]; per axis,
 * center when the content is smaller than the pane (keynote: fitted axis locks
 * at center), else clamp to the edges with PAN_OVERSHOOT slack. */
function clampCamera(cam: Camera, m: Measured): Camera {
  const scale = Math.min(MAX_SCALE, Math.max(fitScaleOf(m), cam.scale));
  const axis = (content: number, view: number, v: number): number => {
    if (content <= view) return (view - content) / 2; // centered, locked
    return Math.min(PAN_OVERSHOOT, Math.max(view - content - PAN_OVERSHOOT, v));
  };
  return {
    scale,
    x: axis(m.nw * scale, m.cw, cam.x),
    y: axis(m.nh * scale, m.ch, cam.y),
  };
}

/** Centered, padded-fit camera — the rest state. */
function fitCamera(m: Measured): Camera {
  const scale = fitScaleOf(m);
  return { scale, x: (m.cw - m.nw * scale) / 2, y: (m.ch - m.nh * scale) / 2 };
}

/** Zoom to `rawScale` while keeping the point under (px, py) fixed. */
function zoomAt(
  cam: Camera,
  rawScale: number,
  px: number,
  py: number,
  m: Measured
): Camera {
  const scale = Math.min(MAX_SCALE, Math.max(fitScaleOf(m), rawScale));
  if (scale === cam.scale) return cam;
  const ratio = scale / cam.scale;
  return clampCamera(
    { scale, x: px - (px - cam.x) * ratio, y: py - (py - cam.y) * ratio },
    m
  );
}

/**
 * Read-only image surface, keynote-style: pinch / Cmd-wheel to zoom (anchored at
 * the cursor), two-finger scroll or pointer-drag to pan, double-click to toggle
 * fit ⇄ actual-ish size. The image rests centered with PADDING breathing room;
 * zoom-out bottoms out at that padded fit, and panning gets PAN_OVERSHOOT slack
 * past the edges. Dependency-free — a CSS transform over the natural-size
 * `<img>`, driven by a small camera over measured container + image geometry.
 * Re-fits whenever `src` changes (navigating files) or the pane resizes.
 *
 * TODO(https://github.com/gridaco/grida/issues/925): this is hand-rolled and
 * image-specific. When a SECOND pan/zoom use case appears, extract the camera
 * math + interaction wiring into a headless, content-agnostic `usePanZoom`
 * primitive and de-dup this — NOT before (YAGNI; see the issue's
 * promotion-on-2nd-consumer rationale).
 */
function ZoomableImage({
  src,
  alt,
  onError,
}: {
  src: string;
  alt: string;
  onError?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // Geometry lives in refs so the once-attached wheel listener and the pointer
  // handlers always read current values (not a stale closure). `cam` is state
  // because it drives render; it stays null until both sizes are known.
  const sizeRef = useRef<{ cw: number; ch: number } | null>(null);
  const natRef = useRef<{ nw: number; nh: number } | null>(null);
  const [cam, setCam] = useState<Camera | null>(null);
  const [panning, setPanning] = useState(false);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(
    null
  );

  const measured = (): Measured | null => {
    const s = sizeRef.current;
    const n = natRef.current;
    return s && n ? { cw: s.cw, ch: s.ch, nw: n.nw, nh: n.nh } : null;
  };

  // New image → forget the old natural size and re-fit on the next load.
  useEffect(() => {
    natRef.current = null;
    setCam(null);
  }, [src]);

  // Track container size; re-clamp (or initialise) the camera on resize.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      sizeRef.current = { cw: r.width, ch: r.height };
      const m = measured();
      if (m) setCam((prev) => (prev ? clampCamera(prev, m) : fitCamera(m)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    natRef.current = { nw: img.naturalWidth, nh: img.naturalHeight };
    if (!sizeRef.current && containerRef.current) {
      const r = containerRef.current.getBoundingClientRect();
      sizeRef.current = { cw: r.width, ch: r.height };
    }
    const m = measured();
    if (m) setCam(fitCamera(m));
  };

  // Wheel must be a non-passive native listener — React's synthetic onWheel is
  // passive, so it can't preventDefault the page scroll. Attached once; reads
  // geometry from refs. Model mirrors `@grida/svg-editor`'s WHEEL_PAN_ZOOM:
  // trackpad pinch (reports `ctrlKey`) and Cmd-wheel ZOOM at the cursor; plain
  // two-finger scroll PANS.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const m = measured();
      if (!m) return;
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        setCam((prev) =>
          prev
            ? zoomAt(
                prev,
                prev.scale * (1 - e.deltaY * WHEEL_ZOOM_SENSITIVITY),
                px,
                py,
                m
              )
            : prev
        );
      } else {
        setCam((prev) =>
          prev
            ? clampCamera(
                { ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY },
                m
              )
            : prev
        );
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Pannable iff the content overflows the pane on some axis (else it's locked
  // centered and there's nothing to drag).
  const m0 = measured();
  const pannable =
    !!m0 &&
    !!cam &&
    (m0.nw * cam.scale > m0.cw + 0.5 || m0.nh * cam.scale > m0.ch + 0.5);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!pannable || !cam) return;
    containerRef.current?.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
    setPanning(true);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    const m = measured();
    if (!d || !m) return;
    const x = d.cx + (e.clientX - d.x);
    const y = d.cy + (e.clientY - d.y);
    setCam((prev) => (prev ? clampCamera({ ...prev, x, y }, m) : prev));
  };
  const endPan = (e: ReactPointerEvent) => {
    drag.current = null;
    setPanning(false);
    containerRef.current?.releasePointerCapture(e.pointerId);
  };

  // Double-click toggles padded-fit ⇄ a magnified view at the cursor (2× the
  // fit, but at least 100% so large images snap to pixel-accurate).
  const onDoubleClick = (e: ReactMouseEvent) => {
    const el = containerRef.current;
    const m = measured();
    if (!el || !m) return;
    const rect = el.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setCam((prev) => {
      if (!prev) return prev;
      const fit = fitScaleOf(m);
      if (prev.scale > fit + 1e-3) return fitCamera(m);
      const target = Math.min(
        MAX_SCALE,
        Math.max(1, fit * DOUBLE_CLICK_FACTOR)
      );
      return zoomAt(prev, target, px, py, m);
    });
  };

  const cursor = pannable ? (panning ? "grabbing" : "grab") : "default";

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-muted/30"
      style={{ touchAction: "none", cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onDoubleClick={onDoubleClick}
    >
      {/* Natural-size `<img>` (max-w-none defeats the global img reset),
          absolutely positioned and driven entirely by the camera transform.
          Faded in (opacity) until the first fit is computed, to avoid a flash
          at full size. MUST gate via `opacity`, NOT `visibility` — the editor
          pane stacks every open tab and hides the inactive ones with
          `invisible` (`visibility: hidden`; see editor-pane-tab.tsx). An
          explicit `visibility: visible` here would pierce that inherited hide
          and paint an inactive image tab over the active one; `opacity` stays
          subordinate to the parent's `visibility: hidden`. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="absolute left-0 top-0 max-w-none select-none"
        draggable={false}
        onLoad={onLoad}
        onError={onError}
        style={{
          transform: cam
            ? `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})`
            : undefined,
          transformOrigin: "0 0",
          opacity: cam ? 1 : 0,
          willChange: "transform",
        }}
      />
    </div>
  );
}

/**
 * Image/video viewers (#924). On desktop the host exposes a streamable
 * `media_url` (`grida-workspace://`, proxied to the sidecar's Range-capable
 * `/workspaces/file` route) — the `<img>/<video>` points at it directly, so the
 * viewer is size-independent (no 1 MiB base64 cap) and video seeking works. On
 * hosts without that scheme (web-daemon dev bridge) `mediaUrl` returns
 * `undefined` and we fall back to the base64 reader. The dispatcher picks a
 * separate child component per transport so each owns its own hooks. Images get
 * the shared {@link ZoomableImage} surface (pinch-zoom, scroll/drag-pan).
 */
export function ImageViewer({
  workspaceId,
  relPath,
}: {
  workspaceId: string;
  relPath: string;
}) {
  const src = workspacesNs.mediaUrl(workspaceId, relPath);
  return src ? (
    <StreamedImage src={src} relPath={relPath} />
  ) : (
    <Base64ImageViewer workspaceId={workspaceId} relPath={relPath} />
  );
}

/** View-local "did the media element fail to load" flag, reset whenever `src`
 * changes — the streamed viewers stay mounted across file navigation (only the
 * `src` prop changes), so a stale error must clear. Returns the flag + the
 * `onError` handler to wire onto the `<img>/<video>`. */
function useMediaLoadError(src: string): readonly [boolean, () => void] {
  const [errored, setErrored] = useState(false);
  useEffect(() => setErrored(false), [src]);
  return [errored, () => setErrored(true)] as const;
}

/** Centered, scrollable surface for the non-zoom media (video) viewers — the
 * `<img>` path uses {@link ZoomableImage}, which brings its own container. */
function MediaContainer({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto bg-muted/30 p-4">
      {children}
    </div>
  );
}

function StreamedImage({ src, relPath }: { src: string; relPath: string }) {
  const [errored, onError] = useMediaLoadError(src);
  if (errored) return <ErrorState message="Couldn't load this file." />;
  return <ZoomableImage src={src} alt={relPath} onError={onError} />;
}

function Base64ImageViewer({
  workspaceId,
  relPath,
}: {
  workspaceId: string;
  relPath: string;
}) {
  const state = useFileBytes(workspaceId, relPath);
  const src =
    state.kind === "ready"
      ? `data:${inferMime(relPath)};base64,${state.base64}`
      : "";
  // Surface a browser decode failure (bytes read fine, but not a valid image) —
  // otherwise ZoomableImage just paints nothing.
  const [errored, onError] = useMediaLoadError(src);
  if (state.kind === "loading") return <LoadingState relPath={relPath} />;
  if (state.kind === "error")
    return <ErrorState message={state.message} hint={SIDECAR_CAP_HINT} />;
  if (errored)
    return (
      <ErrorState message="Couldn't load this file." hint={SIDECAR_CAP_HINT} />
    );
  return <ZoomableImage src={src} alt={relPath} onError={onError} />;
}

export function VideoViewer({
  workspaceId,
  relPath,
}: {
  workspaceId: string;
  relPath: string;
}) {
  const src = workspacesNs.mediaUrl(workspaceId, relPath);
  return src ? (
    <StreamedVideo src={src} />
  ) : (
    <Base64VideoViewer workspaceId={workspaceId} relPath={relPath} />
  );
}

function StreamedVideo({ src }: { src: string }) {
  const [errored, onError] = useMediaLoadError(src);
  if (errored) return <ErrorState message="Couldn't load this file." />;
  return (
    <MediaContainer>
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        className="max-h-full max-w-full object-contain"
        onError={onError}
      />
    </MediaContainer>
  );
}

function Base64VideoViewer({
  workspaceId,
  relPath,
}: {
  workspaceId: string;
  relPath: string;
}) {
  const state = useFileBytes(workspaceId, relPath);
  const src =
    state.kind === "ready"
      ? `data:${inferMime(relPath)};base64,${state.base64}`
      : "";
  const [errored, onError] = useMediaLoadError(src);
  if (state.kind === "loading") return <LoadingState relPath={relPath} />;
  if (state.kind === "error")
    return <ErrorState message={state.message} hint={SIDECAR_CAP_HINT} />;
  if (errored)
    return (
      <ErrorState message="Couldn't load this file." hint={SIDECAR_CAP_HINT} />
    );
  return (
    <MediaContainer>
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        className="max-h-full max-w-full object-contain"
        onError={onError}
      />
    </MediaContainer>
  );
}

/* ────────────────────────────── text ──────────────────────────── */

export function TextViewer({
  workspaceId,
  relPath,
  language,
}: {
  workspaceId: string;
  relPath: string;
  language: BundledLanguage;
}) {
  const state = useFileText(workspaceId, relPath);
  if (state.kind === "loading") return <LoadingState relPath={relPath} />;
  if (state.kind === "error")
    return <ErrorState message={state.message} hint={SIDECAR_CAP_HINT} />;
  return <ShikiBlock code={state.content} language={language} />;
}

/** Shiki-highlighted full-pane code block. Renders the light and
 * dark themes side-by-side via `dark:` visibility — matches the
 * existing `<CodeBlock />` ai-element pattern. */
function ShikiBlock({
  code,
  language,
}: {
  code: string;
  language: BundledLanguage;
}) {
  const [light, setLight] = useState<string>("");
  const [dark, setDark] = useState<string>("");
  // Guard against late `setState` if the user switches tabs before the
  // highlighter resolves. (`codeToHtml` is async because Shiki lazy-
  // loads grammars on first use.)
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    Promise.all([
      codeToHtml(code, { lang: language, theme: "one-light" }),
      codeToHtml(code, { lang: language, theme: "one-dark-pro" }),
    ])
      .then(([l, d]) => {
        if (!live.current) return;
        setLight(l);
        setDark(d);
      })
      .catch(() => {
        // Highlighting failures are non-fatal — fall back to a plain
        // <pre>. The user still gets readable text.
        if (!live.current) return;
        const escaped = code
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        const fallback = `<pre><code>${escaped}</code></pre>`;
        setLight(fallback);
        setDark(fallback);
      });
    return () => {
      live.current = false;
    };
  }, [code, language]);
  // Shared Shiki container styling for both theme blocks. `grida-code-lines`
  // adds the line-number gutter (see app/ui.css), sized by `--ln-w` so the
  // widest line number never clips and the code stays aligned.
  const surface = cn(
    "grida-code-lines [&>pre]:m-0 [&>pre]:min-h-full [&>pre]:bg-background!",
    "[&>pre]:p-4 [&>pre]:text-foreground! [&>pre]:text-xs",
    "[&_code]:font-mono [&_code]:text-xs"
  );
  const gutterStyle = {
    // Digit count + 1ch of breathing room; CSS floors it at 2.5rem.
    "--ln-w": `${String(code.split("\n").length).length + 1}ch`,
  } as CSSProperties;

  return (
    <div className="h-full w-full overflow-auto bg-background text-foreground">
      <div
        className={cn("dark:hidden", surface)}
        style={gutterStyle}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output.
        dangerouslySetInnerHTML={{ __html: light }}
      />
      <div
        className={cn("hidden dark:block", surface)}
        style={gutterStyle}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output.
        dangerouslySetInnerHTML={{ __html: dark }}
      />
    </div>
  );
}

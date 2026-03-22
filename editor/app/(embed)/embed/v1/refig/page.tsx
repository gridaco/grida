"use client";

import React, { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  StandaloneDocumentEditor,
  ViewportRoot,
  EditorSurface,
} from "@/grida-canvas-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FontFamilyListProvider } from "@/scaffolds/sidecontrol/controls/font-family";
import { useRefigEditor } from "@/scaffolds/embed/use-refig-editor";
import { RefigCanvas } from "@/scaffolds/embed/refig-shared";
import { useEmbedBridge } from "@/grida-canvas-react/use-embed-bridge";

function parseFileParam(
  raw: string | null
): { ok: true; url: string } | { ok: false; message: string } {
  if (!raw?.trim()) {
    return {
      ok: false,
      message: "Missing required query parameter: file",
    };
  }
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, message: "Invalid file URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return {
      ok: false,
      message: "file URL must use http: or https:",
    };
  }
  return { ok: true, url: u.toString() };
}

/**
 * Extract a filename hint from the `Content-Disposition` header.
 * Handles both `filename="name.fig"` and `filename*=UTF-8''name.fig` forms.
 */
function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  // RFC 6266 filename*= (UTF-8 encoded, preferred)
  const starMatch = header.match(/filename\*\s*=\s*UTF-8''([^;\s]+)/i);
  if (starMatch) return decodeURIComponent(starMatch[1]);
  // Plain filename=
  const plainMatch = header.match(/filename\s*=\s*"?([^";\s]+)"?/i);
  if (plainMatch) return plainMatch[1];
  return null;
}

const SUPPORTED_EXT_RE = /\.(fig|json\.gz|json|zip)$/i;

/**
 * Infer a usable filename from a remote URL + response headers.
 *
 * Resolution order (first match wins):
 * 1. `Content-Disposition` header (handles signed/opaque URLs where the path is meaningless)
 * 2. URL pathname extension
 * 3. `Content-Type` / `Content-Encoding` header heuristics
 * 4. Fallback to `.fig` for octet-stream / empty content-type
 */
function inferFilenameForRemote(
  url: string,
  contentType: string | null,
  contentDisposition: string | null = null,
  contentEncoding: string | null = null
): string | null {
  // 1. Content-Disposition (most reliable for signed URLs)
  const cdName = parseContentDispositionFilename(contentDisposition);
  if (cdName && SUPPORTED_EXT_RE.test(cdName)) {
    return cdName;
  }

  // 2. URL pathname
  let pathName: string;
  try {
    pathName = new URL(url).pathname;
  } catch {
    pathName = "";
  }
  const base = decodeURIComponent(pathName.split("/").pop() || "");
  if (SUPPORTED_EXT_RE.test(base)) {
    return base;
  }

  // 3. Content-Type / Content-Encoding heuristics
  const ct = (contentType || "").toLowerCase();
  const ce = (contentEncoding || "").toLowerCase();

  // gzip-compressed JSON (Content-Type: application/json + Content-Encoding: gzip,
  // or Content-Type: application/gzip with a JSON hint in the URL/disposition)
  if (
    ct.includes("application/gzip") ||
    ct.includes("application/x-gzip") ||
    (ce.includes("gzip") &&
      (ct.includes("application/json") || ct.includes("text/json")))
  ) {
    return "remote.json.gz";
  }

  if (ct.includes("application/json") || ct.includes("text/json")) {
    return "remote.json";
  }
  if (
    ct.includes("application/zip") ||
    ct.includes("application/x-zip-compressed")
  ) {
    return "remote.zip";
  }
  if (ct.includes("application/octet-stream") || ct === "") {
    return "remote.fig";
  }
  return null;
}

function RefigEmbedInner({ remoteFileUrl }: { remoteFileUrl?: string }) {
  const {
    editor: instance,
    fonts,
    canvasRef,
    canvasReady,
    loading,
    loadError,
    documentLoaded,
    onFile,
  } = useRefigEditor();

  useEmbedBridge(instance, { canvasReady, onFile });

  const remoteFetchGen = useRef(0);

  useEffect(() => {
    if (!remoteFileUrl || !canvasReady) return;

    const gen = ++remoteFetchGen.current;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(remoteFileUrl, { mode: "cors" });
        if (!res.ok) {
          throw new Error(`Failed to fetch file (HTTP ${res.status})`);
        }
        const ct = res.headers.get("content-type");
        const cd = res.headers.get("content-disposition");
        const ce = res.headers.get("content-encoding");
        const buf = await res.arrayBuffer();
        const inferred = inferFilenameForRemote(remoteFileUrl, ct, cd, ce);
        if (!inferred) {
          throw new Error(
            "Could not infer a supported extension (.fig, .json, .json.gz, .zip) from the URL or Content-Type"
          );
        }
        const file = new File([buf], inferred, {
          type: ct || "application/octet-stream",
        });
        if (cancelled || gen !== remoteFetchGen.current) return;
        await onFile(file);
      } catch (e) {
        if (cancelled || gen !== remoteFetchGen.current) return;
        console.error("[@grida/refig] remote fetch", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [remoteFileUrl, canvasReady, onFile]);

  const showLoadingOverlay = !documentLoaded && !!remoteFileUrl && !loadError;

  return (
    <TooltipProvider>
      <FontFamilyListProvider fonts={fonts}>
        <StandaloneDocumentEditor editor={instance}>
          <div
            className="relative h-dvh w-full overflow-hidden bg-background"
            aria-busy={showLoadingOverlay || loading}
          >
            {loadError ? (
              <span className="sr-only" role="alert">
                {loadError}
              </span>
            ) : null}
            <div className="relative h-full w-full">
              <ViewportRoot className="relative h-full w-full overflow-hidden">
                <EditorSurface />
                <RefigCanvas canvasRef={canvasRef} />
              </ViewportRoot>
              {showLoadingOverlay ? (
                <div className="absolute inset-0 bg-background" aria-hidden />
              ) : null}
            </div>
          </div>
        </StandaloneDocumentEditor>
      </FontFamilyListProvider>
    </TooltipProvider>
  );
}

function RefigEmbedContent() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("file");

  // `?file=` is optional — users can load files entirely via postMessage.
  if (!raw) {
    return <RefigEmbedInner />;
  }

  const parsed = parseFileParam(raw);
  if (!parsed.ok) {
    return (
      <div
        role="alert"
        className="flex min-h-dvh items-center justify-center p-8 text-center text-sm text-destructive"
      >
        {parsed.message}
      </div>
    );
  }

  return <RefigEmbedInner remoteFileUrl={parsed.url} />;
}

export default function RefigEmbedPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <RefigEmbedContent />
    </Suspense>
  );
}

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
import {
  useEmbedViewer,
  type FileConverter,
} from "@/scaffolds/embed/use-embed-viewer";
import { RefigCanvas } from "@/scaffolds/embed/refig-shared";
import { useEmbedBridge } from "@/grida-canvas-react/use-embed-bridge";
import {
  figBytesToGridaDocument,
  restJsonToGridaDocument,
} from "@grida/io-figma/fig2grida-core";

/**
 * File converter for the general-purpose embed.
 *
 * Unlike the Figma-specific embed, `preserve_figma_ids` is false —
 * node IDs in events use Grida-internal IDs, not Figma IDs.
 *
 * Uses the in-memory API to avoid the pack/unpack round-trip through
 * .grida archives.
 */
const generalConverter: FileConverter = (input) => {
  if (input instanceof Uint8Array) {
    return figBytesToGridaDocument(input, {
      placeholder_for_missing_images: false,
      preserve_figma_ids: false,
    });
  }
  return restJsonToGridaDocument(input, {
    placeholder_for_missing_images: false,
    preserve_figma_ids: false,
  });
};

const SUPPORTED_EXT_RE = /\.(grida|grida1|fig|json\.gz|json|zip)$/i;

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
 */
function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const starMatch = header.match(/filename\*\s*=\s*UTF-8''([^;\s]+)/i);
  if (starMatch) return decodeURIComponent(starMatch[1]);
  const plainMatch = header.match(/filename\s*=\s*"?([^";\s]+)"?/i);
  if (plainMatch) return plainMatch[1];
  return null;
}

/**
 * Infer a usable filename from a remote URL + response headers.
 *
 * Falls back to `.grida` for unknown octet-stream (general-purpose default).
 */
function inferFilenameForRemote(
  url: string,
  contentType: string | null,
  contentDisposition: string | null = null,
  contentEncoding: string | null = null
): string | null {
  const cdName = parseContentDispositionFilename(contentDisposition);
  if (cdName && SUPPORTED_EXT_RE.test(cdName)) {
    return cdName;
  }

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

  const ct = (contentType || "").toLowerCase();
  const ce = (contentEncoding || "").toLowerCase();

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
    return "remote.grida";
  }
  return null;
}

function EmbedViewerInner({ remoteFileUrl }: { remoteFileUrl?: string }) {
  const {
    editor: instance,
    fonts,
    canvasRef,
    canvasReady,
    loading,
    loadError,
    documentLoaded,
    onFile,
  } = useEmbedViewer({ converter: generalConverter });

  // General-purpose embed: no ID transform
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
            "Could not infer a supported extension (.grida, .grida1, .fig, .json, .json.gz, .zip) from the URL or Content-Type"
          );
        }
        const file = new File([buf], inferred, {
          type: ct || "application/octet-stream",
        });
        if (cancelled || gen !== remoteFetchGen.current) return;
        await onFile(file);
      } catch (e) {
        if (cancelled || gen !== remoteFetchGen.current) return;
        console.error("[@grida/embed] remote fetch", e);
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

function EmbedViewerContent() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("file");

  if (!raw) {
    return <EmbedViewerInner />;
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

  return <EmbedViewerInner remoteFileUrl={parsed.url} />;
}

/**
 * General-purpose embed viewer page (`/embed/v1/`).
 *
 * Supports all Grida-compatible file formats:
 * - `.grida` — native Grida archive (ZIP with FlatBuffers document + assets)
 * - `.grida1` — Grida JSON snapshot
 * - `.fig` — Figma binary (converted via fig2grida)
 * - `.json` / `.json.gz` / `.zip` — Figma REST formats
 *
 * Unlike `/embed/v1/figma`, this page does NOT apply Figma ID transforms.
 * Node IDs in `selection-change` and other events use Grida-internal IDs.
 *
 * Use this endpoint when embedding any design file and you don't need
 * Figma-specific ID mapping in the event contract.
 */
export default function EmbedPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <EmbedViewerContent />
    </Suspense>
  );
}

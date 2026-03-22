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

function inferFilenameForRemote(
  url: string,
  contentType: string | null
): string | null {
  let pathName: string;
  try {
    pathName = new URL(url).pathname;
  } catch {
    return null;
  }
  const base = pathName.split("/").pop() || "";
  if (/\.(fig|json|zip)$/i.test(base)) {
    return base;
  }
  const ct = (contentType || "").toLowerCase();
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

function RefigEmbedInner({ remoteFileUrl }: { remoteFileUrl: string }) {
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
        const buf = await res.arrayBuffer();
        const inferred = inferFilenameForRemote(remoteFileUrl, ct);
        if (!inferred) {
          throw new Error(
            "Could not infer a supported extension (.fig, .json, .zip) from the URL or Content-Type"
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
  const parsed = parseFileParam(searchParams.get("file"));

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

"use client";

import React, { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/lib/utils";
import {
  AuthProvider,
  useContinueWithAuth,
} from "@/host/auth/use-continue-with-auth";
import {
  DownloadIcon,
  ImageIcon,
  Loader2Icon,
  RotateCcwIcon,
  UploadIcon,
} from "lucide-react";
import type {
  RemoveBackgroundImageApiRequestBody,
  RemoveBackgroundImageApiResponse,
} from "@/app/(api)/private/ai/image/remove-background/route";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function RemoveBackgroundTool() {
  return (
    <AuthProvider>
      <div className="container mx-auto px-4 pt-24 md:pt-28 xl:pt-36 pb-24 min-h-screen">
        <div className="max-w-5xl mx-auto">
          <header className="mb-10 text-left">
            <h1 className="text-3xl font-semibold tracking-tight mb-3">
              Remove Background
            </h1>
            <p className="text-muted-foreground text-sm font-light max-w-2xl">
              Drop an image to remove its background with AI. Sign in to process
              your image — your free monthly budget covers the cost.
            </p>
          </header>
          <Workspace />
        </div>
      </div>
    </AuthProvider>
  );
}

function Workspace() {
  const { withAuth } = useContinueWithAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const accept = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("Image is too large (max 10MB).");
      return;
    }
    setError(null);
    setResultUrl(null);
    const dataUrl = await readFileAsDataURL(file);
    setSourceUrl(dataUrl);
  }, []);

  const onFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      void accept(list[0]);
    },
    [accept]
  );

  const removeBackground = useCallback(async () => {
    if (!sourceUrl) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/private/ai/image/remove-background`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: sourceUrl,
        } satisfies RemoveBackgroundImageApiRequestBody),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        setError(data.message ?? "Something went wrong.");
        return;
      }
      const data = (await res.json()) as RemoveBackgroundImageApiResponse;
      const url =
        data.data.image.kind === "url"
          ? data.data.image.url
          : data.data.image.base64;
      setResultUrl(url);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [sourceUrl]);

  const onSubmit = withAuth(removeBackground);

  const reset = () => {
    setSourceUrl(null);
    setResultUrl(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="grid gap-6">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFiles(e.currentTarget.files)}
      />

      {!sourceUrl ? (
        <Dropzone
          dragOver={dragOver}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Panel title="Original">
            <ImagePreview src={sourceUrl} alt="Original" />
          </Panel>
          <Panel title="Result">
            {resultUrl ? (
              <ImagePreview
                src={resultUrl}
                alt="Background removed"
                checkerboard
              />
            ) : (
              <div className="flex flex-col items-center justify-center aspect-square border rounded-lg bg-muted/40 text-muted-foreground text-sm">
                {loading ? (
                  <>
                    <Loader2Icon className="size-6 animate-spin mb-2" />
                    Removing background…
                  </>
                ) : (
                  <>
                    <ImageIcon className="size-6 mb-2 opacity-50" />
                    Result will appear here
                  </>
                )}
              </div>
            )}
          </Panel>
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md px-4 py-2">
          {error}
        </div>
      )}

      {sourceUrl && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => onSubmit()} disabled={loading || !sourceUrl}>
            {loading ? (
              <>
                <Loader2Icon className="size-4 animate-spin mr-2" />
                Removing…
              </>
            ) : (
              <>Remove background</>
            )}
          </Button>
          {resultUrl && (
            <Button variant="outline" asChild>
              <a href={resultUrl} download="background-removed.png">
                <DownloadIcon className="size-4 mr-2" />
                Download
              </a>
            </Button>
          )}
          <Button variant="ghost" onClick={reset} disabled={loading}>
            <RotateCcwIcon className="size-4 mr-2" />
            Start over
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            onClick={() => inputRef.current?.click()}
            disabled={loading}
          >
            <UploadIcon className="size-4 mr-2" />
            Replace image
          </Button>
        </div>
      )}
    </div>
  );
}

function Dropzone({
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
}: {
  dragOver: boolean;
  onDragOver: React.DragEventHandler<HTMLButtonElement>;
  onDragLeave: React.DragEventHandler<HTMLButtonElement>;
  onDrop: React.DragEventHandler<HTMLButtonElement>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "w-full rounded-xl border-2 border-dashed transition-colors p-12 text-center",
        "flex flex-col items-center justify-center gap-3",
        "hover:bg-muted/40 hover:border-foreground/20",
        dragOver
          ? "border-foreground/40 bg-muted/60"
          : "border-border bg-background"
      )}
    >
      <div className="rounded-full bg-muted p-3">
        <UploadIcon className="size-5" />
      </div>
      <div className="text-base font-medium">Drop an image here</div>
      <div className="text-sm text-muted-foreground">
        or click to browse — JPG, PNG, WebP up to 10MB
      </div>
    </button>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function ImagePreview({
  src,
  alt,
  checkerboard,
}: {
  src: string;
  alt: string;
  checkerboard?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative aspect-square overflow-hidden rounded-lg border",
        checkerboard && "bg-checkerboard"
      )}
      style={
        checkerboard
          ? {
              backgroundImage:
                "linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(-45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, hsl(var(--muted)) 75%), linear-gradient(-45deg, transparent 75%, hsl(var(--muted)) 75%)",
              backgroundSize: "20px 20px",
              backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
            }
          : undefined
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-contain"
        crossOrigin="anonymous"
      />
    </div>
  );
}

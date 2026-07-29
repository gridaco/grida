"use client";

import { useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon, DownloadIcon, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@app/ui/components/button";
import { ZoomableImage } from "@/components/zoomable-image";
import { ImageTransfer } from "./image-transfer";

/**
 * Fullscreen inspection UI for one image.
 *
 * The source remains independent from the rendered camera, so Copy and
 * Download always operate on the original bytes.
 */
export function FullscreenImagePreview({
  src,
  alt,
  title,
  downloadName,
  className,
  children,
}: {
  src: string;
  alt: string;
  title?: string;
  downloadName?: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setCopied(false);
  };

  const onCopy = async () => {
    try {
      await new ImageTransfer(src, downloadName).copyToClipboard();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is best-effort and can be denied by the host.
    }
  };

  const onDownload = async () => {
    try {
      await new ImageTransfer(src, downloadName).download();
    } catch {
      // Remote images may not grant the browser permission to read their bytes.
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className={`inline-block max-w-full cursor-zoom-in rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className ?? ""}`}
          title={title}
        >
          {children}
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200" />
        <DialogPrimitive.Content
          data-testid="dialog-image-preview"
          className="fixed top-1/2 left-1/2 z-50 grid h-dvh max-h-dvh w-screen max-w-none -translate-x-1/2 -translate-y-1/2 gap-0 overflow-hidden rounded-none border-0 bg-transparent p-0 shadow-none outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200 sm:max-w-none"
        >
          <DialogPrimitive.Title className="sr-only">
            {title ?? alt}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Fullscreen image preview with zoom, copy, and download actions.
          </DialogPrimitive.Description>
          <ZoomableImage
            src={src}
            alt={alt}
            className="bg-transparent"
            imageClassName="shadow-2xl"
            onBackgroundClick={() => setOpen(false)}
          />
          <div className="desktop-no-drag absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-md border border-white/10 bg-black/55 p-1 text-white shadow-sm backdrop-blur-md">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-white/75 hover:bg-white/10 hover:text-white"
              aria-label={copied ? "Copied" : "Copy image"}
              title={copied ? "Copied" : "Copy image"}
              onClick={() => void onCopy()}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-white/75 hover:bg-white/10 hover:text-white"
              aria-label="Download image"
              title="Download image"
              onClick={() => void onDownload()}
            >
              <DownloadIcon />
            </Button>
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-white/75 hover:bg-white/10 hover:text-white"
                aria-label="Close"
                title="Close"
              >
                <XIcon />
              </Button>
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

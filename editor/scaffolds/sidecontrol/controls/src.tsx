"use client";

import React, { createContext, useEffect } from "react";
import { tokens } from "@grida/tokens";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/components/lib/utils";
import { Cross2Icon } from "@radix-ui/react-icons";
import { toast } from "sonner";
import { useFilePicker } from "use-file-picker";

/**
 * default value - only for development & playground
 *
 * @param file
 * @returns
 */
async function localBlobUploader(file: File) {
  console.warn("localBlobUploader is used. This is only for development.");
  const url = URL.createObjectURL(file);
  return { src: url };
}

interface SrcUploaderContext {
  uploader: (file: File) => Promise<{ src: string }>;
}

const SrcUploaderContext = createContext<SrcUploaderContext | null>({
  uploader: localBlobUploader,
});

export function SrcUploaderProvider({
  uploader,
  children,
}: React.PropsWithChildren<SrcUploaderContext>) {
  return (
    <SrcUploaderContext.Provider
      value={{
        uploader,
      }}
    >
      {children}
    </SrcUploaderContext.Provider>
  );
  //
}

function useSrcUploader() {
  const context = React.useContext(SrcUploaderContext);
  if (!context) {
    throw new Error("useSrcUploader must be used within a SrcUploaderProvider");
  }
  return context;
}

export function SrcControl({
  value = "",
  onValueChange,
}: {
  value?: tokens.StringValueExpression;
  onValueChange?: (value?: tokens.StringValueExpression) => void;
}) {
  const { uploader } = useSrcUploader();
  const { openFilePicker, plainFiles, loading } = useFilePicker({
    readAs: "ArrayBuffer",
    accept: "image/*",
    multiple: false,
  });

  useEffect(
    () => {
      if (plainFiles.length > 0) {
        const uploading = uploader(plainFiles[0]).then((r) =>
          onValueChange?.(r.src)
        );

        toast.promise(uploading, {
          loading: "Uploading...",
          success: "Uploaded",
          error: "Failed to upload",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plainFiles]
  );

  return (
    <div
      onClick={openFilePicker}
      className={cn(
        "flex items-center border cursor-default",
        WorkbenchUI.inputVariants({ size: "xs", variant: "paint-container" })
      )}
    >
      {value ? (
        <>
          <div className="flex items-center flex-1">
            {typeof value === "string" && <Thumb src={value} />}
            <span className="ms-2 text-xs">Image</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onValueChange?.(undefined);
            }}
            className="px-1 py-1 me-0.5 text-muted-foreground"
          >
            <Cross2Icon className="w-3.5 h-3.5" />
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center flex-1 text-muted-foreground">
            <ThumbPlaceholder />
            <span className="ms-2 text-xs">Add...</span>
          </div>
        </>
      )}
    </div>
  );
}

function Thumb({ src }: { src: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={40}
      height={40}
      className="object-cover w-5 h-5 overflow-hidden rounded-sm border"
      alt="thumb"
    />
  );
}

function ThumbPlaceholder() {
  return (
    <div className="w-5 h-5 overflow-hidden rounded-sm border bg-secondary" />
  );
}

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useFilePicker } from "use-file-picker";
import * as Tabs from "@radix-ui/react-tabs";
import * as Dialog from "@radix-ui/react-dialog";
import { createClientFormsClient } from "@/lib/supabase/client";
import { useEditorState } from "../editor";
import { nanoid } from "nanoid";

export function MediaPicker({
  open,
  onOpenChange,
  onUseImage,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onUseImage?: (url: string) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay>
          <Dialog.Content className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
            <div className="flex flex-col min-w-96 max-w-screen-sm bg-white rounded-lg shadow-lg">
              <Tabs.Root>
                <Tabs.List className="flex gap-2 border-b px-4">
                  <Tab value="upload">Upload</Tab>
                  <Tab value="url">URL</Tab>
                  <Tab value="explore">Explore</Tab>
                </Tabs.List>
                <div className="mt-4 h-96 p-4">
                  <Tabs.Content value="url" className="h-full">
                    <FromUrl />
                  </Tabs.Content>
                  <Tabs.Content value="upload" className="h-full">
                    <FromFilePicker onUseImage={onUseImage} />
                  </Tabs.Content>
                  <Tabs.Content value="search" className="h-full">
                    <div>Search content</div>
                  </Tabs.Content>
                </div>
              </Tabs.Root>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Tab({
  value,
  children,
}: React.PropsWithChildren<{
  value: string;
}>) {
  return (
    <Tabs.Trigger
      className="
        mx-2 px-2 py-4 border-b-2 border-transparent opacity-50 hover:border-black min-w-10
        data-[state='active']:border-black
        data-[state='active']:opacity-100
        transition-all
        font-medium text-sm
      "
      value={value}
    >
      <div>{children}</div>
    </Tabs.Trigger>
  );
}

function FromUrl() {
  const [url, setUrl] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <input
        className="
        w-full
        hover:shadow focus:shadow
        hover:border-black/10 focus:border-black/10
        dark:hover:border-white/10 dark:focus:border-white/10
        focus:outline-none focus:shadow-outline
        text-neutral-700
        dark:text-neutral-300
        dark:bg-black/10
        border border-transparent
        box-border appearance-none rounded py-2 px-3 leading-tight transition-all
        "
        type="text"
        placeholder="Enter URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <div className="w-full h-full">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="object-contain" src={url} alt="" />
        )}
      </div>
    </div>
  );
}

export function useUploadFile() {
  const [state] = useEditorState();
  const supabase = createClientFormsClient();

  return useCallback(
    async (file: Blob | File) => {
      const fileKey = `${state.form_id}/${nanoid()}`;
      return await supabase.storage
        .from("grida-forms")
        .upload(fileKey, file, {
          contentType: file.type,
        })
        .then(({ data, error }) => {
          if (error) {
            throw new Error("Failed to upload file");
          }
          return supabase.storage.from("grida-forms").getPublicUrl(fileKey).data
            .publicUrl;
        });
    },
    [supabase.storage, state.form_id]
  );
}

function FromFilePicker({
  onUseImage,
}: {
  onUseImage?: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [src, setSrc] = useState<string | null>(null);

  const { openFilePicker, filesContent, plainFiles, loading } = useFilePicker({
    readAs: "ArrayBuffer",
    accept: "image/*",
    multiple: false,
  });

  const ready = src && !uploading;
  const plainfile = plainFiles[0];
  const file = filesContent[0];

  const uploadFile = useUploadFile();

  useEffect(() => {
    if (file) {
      const blob = new Blob([file.content], { type: file.type });
      setSrc(URL.createObjectURL(blob));
    }
  }, [file]);

  useEffect(() => {
    if (plainfile) {
      setUploading(true);
      uploadFile(plainfile)
        .then(setSrc)
        .finally(() => setUploading(false));
    }
    // setting uploadFile as deps will cause infinite re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plainfile]);

  return (
    <div className="relative w-full h-full">
      {src ? (
        <button className="w-full h-full" onClick={openFilePicker}>
          {uploading && (
            <div className="absolute z-10 top-0 left-0 w-full h-full flex items-center justify-center bg-black/50 text-white">
              Uploading...
            </div>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            data-uploading={uploading}
            className="w-full h-full object-contain data-[uploading='true']:opacity-50"
            src={src}
            alt=""
          />
        </button>
      ) : (
        <button
          className="flex flex-col gap-2 items-center justify-center border-2 border-dashed border-black/20 rounded bg-black/10 w-full h-full"
          onClick={openFilePicker}
        >
          {loading ? (
            <></>
          ) : (
            <>
              Upload an image
              <span className="text-xs opacity-50">
                JPG, PNG, or GIF up to 10MB
              </span>
            </>
          )}
        </button>
      )}
      <footer className="absolute bottom-0 right-0 left-0">
        {src && (
          <button
            className="py-2 px-4 bg-blue-500 text-white rounded"
            disabled={!ready}
            onClick={() => onUseImage?.(src!)}
          >
            Use Image
          </button>
        )}
      </footer>
    </div>
  );
}

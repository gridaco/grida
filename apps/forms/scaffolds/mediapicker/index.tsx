"use client";

import React, { useEffect, useState } from "react";
import { useFilePicker } from "use-file-picker";
import * as Tabs from "@radix-ui/react-tabs";
import * as Dialog from "@radix-ui/react-dialog";
import { Cross1Icon } from "@radix-ui/react-icons";

export function MediaPicker({
  open,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
                    <FromFilePicker />
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
        text-gray-700
        dark:text-gray-300
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

function FromFilePicker() {
  const [src, setSrc] = useState<string | null>(null);
  const { openFilePicker, filesContent, loading } = useFilePicker({
    readAs: "DataURL",
    accept: "image/*",
    multiple: false,
  });

  useEffect(() => {
    if (filesContent.length) {
      setSrc(filesContent[0].content);
    }
  }, [filesContent]);

  return (
    <>
      {src ? (
        <button
          className="w-full h-full"
          onClick={() => {
            openFilePicker();
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="w-full h-full object-contain" src={src} alt="" />
        </button>
      ) : (
        <button
          className="flex flex-col gap-2 items-center justify-center border-2 border-dashed border-black/20 rounded bg-black/10 w-full h-full"
          onClick={() => {
            openFilePicker();
          }}
        >
          {loading ? (
            <>Uploading...</>
          ) : (
            <>
              Upload an image
              <span className="text-xs opacity-50">
                JPG PNG or GIF up to 10MB
              </span>
            </>
          )}
        </button>
      )}
    </>
  );
}

"use client";

import React, { useState } from "react";
import { useFilePicker } from "use-file-picker";
import * as Tabs from "@radix-ui/react-tabs";
import * as Dialog from "@radix-ui/react-dialog";

export function MediaPicker({ open }: { open?: boolean }) {
  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Content className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
          <div className="flex flex-col w-96 h-96 bg-white rounded-lg shadow-lg p-4">
            <Tabs.Root>
              <Tabs.List className="flex gap-4">
                <Tabs.Trigger value="upload">Upload</Tabs.Trigger>
                <Tabs.Trigger value="url">URL</Tabs.Trigger>
                <Tabs.Trigger value="explore">Explore</Tabs.Trigger>
              </Tabs.List>
              <Tabs.Content value="url">
                <FromUrl />
              </Tabs.Content>
              <Tabs.Content value="upload">
                <FromFilePicker />
              </Tabs.Content>
              <Tabs.Content value="search">
                <div>Search content</div>
              </Tabs.Content>
            </Tabs.Root>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FromUrl() {
  const [url, setUrl] = useState("");
  return (
    <div>
      <input
        type="text"
        placeholder="Enter URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" />
    </div>
  );
}

function FromFilePicker() {
  const { openFilePicker, filesContent, loading } = useFilePicker({
    readAs: "DataURL",
    accept: "image/*",
    multiple: false,
  });

  return (
    <div>
      Upload content
      <button
        onClick={() => {
          openFilePicker();
        }}
      >
        Upload
      </button>
    </div>
  );
}

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useFilePicker } from "use-file-picker";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogDescription,
  DialogHeader,
} from "@/components/ui/dialog";
import { createClientFormsClient } from "@/lib/supabase/client";
import { useEditorState } from "../editor";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/spinner";

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Tabs>
        <DialogContent>
          <DialogHeader>
            <div>
              <TabsList>
                <TabsTrigger value="upload">Upload</TabsTrigger>
                <TabsTrigger value="url">URL</TabsTrigger>
                <TabsTrigger value="explore">Explore</TabsTrigger>
              </TabsList>
            </div>
          </DialogHeader>
          <div className="h-96">
            <TabsContent value="url" className="h-full">
              <FromUrl />
            </TabsContent>
            <TabsContent value="upload" className="h-full">
              <FromFilePicker onUseImage={onUseImage} />
            </TabsContent>
            <TabsContent value="search" className="h-full">
              <div>Search content</div>
            </TabsContent>
          </div>
        </DialogContent>
      </Tabs>
    </Dialog>
  );
}

function FromUrl() {
  const [url, setUrl] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="url">
        URL to{" "}
        <span className="font-mono text-muted-foreground text-sm">
          .png .jpeg .gif
        </span>
      </Label>
      <Input
        id="url"
        type="text"
        placeholder="https://example.com/image.png"
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
            <div className="absolute z-10 top-0 left-0 w-full h-full flex items-center justify-center">
              <Spinner />
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
          className="flex flex-col gap-2 items-center justify-center border-2 border-dashed rounded w-full h-full"
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
        <div className="p-2">
          {src && (
            <Button
              variant={"outline"}
              disabled={!ready}
              onClick={() => onUseImage?.(src!)}
            >
              Use Image
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

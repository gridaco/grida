"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import {
  Dialog,
  DialogPortal,
  DialogContent,
  DialogClose,
  DialogOverlay,
} from "@radix-ui/react-dialog";
import { Cross2Icon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";

type MediaViewerAcceptedMimeTypes = "image/*" | "video/*" | "audio/*";

interface MediaViewerContextType {
  open: (src: string, type: MediaViewerAcceptedMimeTypes) => void;
  close: () => void;
}

const MediaViewerContext = createContext<MediaViewerContextType | undefined>(
  undefined
);

export function useMediaViewer() {
  const context = useContext(MediaViewerContext);
  if (!context) {
    throw new Error("useMediaViewer must be used within a MediaViewerProvider");
  }
  return context;
}

interface MediaViewerProviderProps {
  children: ReactNode;
}

export function MediaViewerProvider({ children }: MediaViewerProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mediaSrc, setMediaSrc] = useState("");
  const [mediaType, setMediaType] =
    useState<MediaViewerAcceptedMimeTypes>("image/*");

  const open = (src: string, type: MediaViewerAcceptedMimeTypes) => {
    setMediaSrc(src);
    setMediaType(type);
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
  };

  return (
    <MediaViewerContext.Provider value={{ open, close }}>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 bg-black bg-opacity-75 z-50" />
          <DialogContent className="fixed inset-0 flex items-center justify-center z-50">
            <DialogClose className="absolute top-4 right-4">
              <Button variant="outline" size="icon">
                <Cross2Icon />
              </Button>
            </DialogClose>
            <div className="w-full h-full p-10">
              {mediaType.startsWith("image/") && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaSrc}
                  alt="Media"
                  className="w-full h-full object-contain"
                />
              )}
              {mediaType.startsWith("video/") && (
                <video
                  src={mediaSrc}
                  controls
                  className="max-w-full max-h-full"
                >
                  Your browser does not support the video tag.
                </video>
              )}
              {mediaType.startsWith("audio/") && (
                <audio src={mediaSrc} controls className="w-full">
                  Your browser does not support the audio tag.
                </audio>
              )}
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>
      {children}
    </MediaViewerContext.Provider>
  );
}

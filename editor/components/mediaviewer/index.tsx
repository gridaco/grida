"use client";

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
} from "react";
import {
  Dialog,
  DialogPortal,
  DialogContent,
  DialogClose,
  DialogOverlay,
} from "@radix-ui/react-dialog";
import {
  Cross2Icon,
  DownloadIcon,
  ExitFullScreenIcon,
  PlayIcon,
} from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Menubar } from "@/components/ui/menubar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileTypeIcon } from "@/components/form-field-type-icon";
import { PictureInPicture } from "@/components/pip";
import { AudioLinesIcon } from "lucide-react";
import { ContentAudio } from "./pip-audio-content";
import { wellkown } from "@/utils/mimetype";

type MediaViewerAcceptedPlayableMimeTypes = "video/*" | "audio/*";
type MediaViewerAcceptedMimeTypes = "image/*" | "video/*" | "audio/*" | "*/*";

export type MediaObject = {
  title?: string;
  src: string;
  download?: string;
  srcset?: {
    thumbnail: string;
    original: string;
  };
};

interface MediaViewerContextType {
  open: (
    src: MediaObject,
    meta?: { contentType?: MediaViewerAcceptedMimeTypes }
  ) => void;
  openInPictureInPicture: (
    src: MediaObject,
    meta?: { contentType?: MediaViewerAcceptedPlayableMimeTypes }
  ) => void;
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

export function MediaViewerProvider({ children }: React.PropsWithChildren) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPip, setIsPip] = useState(false);
  const [mediaSrc, setMediaSrc] = useState<MediaObject | undefined>(undefined);
  const [mediaType, setMediaType] =
    useState<MediaViewerAcceptedMimeTypes>("*/*");
  const [contentType, setContentType] = useState<
    "unknwon" | (string & {}) | undefined
  >(undefined);

  const open = useCallback(
    (
      src: MediaObject,
      meta?: {
        contentType?: MediaViewerAcceptedMimeTypes;
      }
    ) => {
      setIsPip(false);
      setMediaSrc(src);
      if (meta) {
        const { contentType } = meta;
        if (contentType && contentType !== "*/*") {
          setMediaType(contentType);
          setContentType(contentType);
        } else {
          setMediaType("*/*");
          setContentType(undefined);
        }
      }
      setIsOpen(true);
    },
    []
  );

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const openInPictureInPicture = useCallback(
    (
      src: MediaObject,
      meta?: {
        contentType?: MediaViewerAcceptedMimeTypes;
      }
    ) => {
      open(src, meta);
      setIsPip(true);
    },
    [open]
  );

  useEffect(() => {
    // Fetch content type if not provided
    if ((!mediaType || mediaType === "*/*") && mediaSrc?.src) {
      head(mediaSrc.src)
        .then((res) => {
          setContentType(res["content-type"]);
        })
        .catch(() => {
          setContentType("unknwon");
        });
    }
  }, [mediaSrc?.src, mediaType]);

  return (
    <MediaViewerContext.Provider
      value={{ open, close, openInPictureInPicture }}
    >
      {isPip && isOpen && mediaSrc && (
        <PictureInPicture
          padding={16}
          className="relative h-48 aspect-video shadow-2xl flex items-center justify-center"
        >
          <header className="absolute top-0 left-0 right-0 z-10">
            <div className="p-1 flex justify-between items-center">
              <div />
              <div>
                <Button variant="ghost" size="icon" onClick={close}>
                  <Cross2Icon />
                </Button>
              </div>
            </div>
          </header>
          <PipPlayerContent
            mediaSrc={mediaSrc}
            contentType={contentType as any}
          />
          {/* <Button variant="outline" size="icon">
              <PlayIcon />
            </Button> */}
        </PictureInPicture>
      )}
      {!isPip && (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogPortal>
            <DialogOverlay className="fixed inset-0 bg-black/75 z-50" />
            <DialogContent className="fixed inset-0 flex items-center justify-center z-50">
              <DialogClose className="absolute top-4 right-4">
                <Button variant="outline" size="icon">
                  <Cross2Icon />
                </Button>
              </DialogClose>
              <div className="w-full h-full p-10">
                <StandaloneMediaView
                  mediaSrc={mediaSrc}
                  contentType={contentType}
                />
              </div>
              <footer className="absolute bottom-4 left-4 right-4 flex items-center justify-center">
                <Menubar>
                  <Button
                    disabled={!mediaSrc?.download}
                    onClick={() => {
                      if (mediaSrc?.download) {
                        window.open(mediaSrc.download, "_blank");
                      }
                    }}
                    variant="ghost"
                    size="icon"
                  >
                    <DownloadIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsOpen(false)}
                  >
                    <ExitFullScreenIcon />
                  </Button>
                </Menubar>
              </footer>
            </DialogContent>
          </DialogPortal>
        </Dialog>
      )}
      {children}
    </MediaViewerContext.Provider>
  );
}

function PipPlayerContent({
  mediaSrc,
  contentType,
}: {
  mediaSrc: MediaObject;
  contentType: `audio/${string}` | `video/${string}` | undefined | "unknwon";
}) {
  if (contentType === "unknwon") {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <PipPlayerErrorMessage>Unable to read the file</PipPlayerErrorMessage>
      </div>
    );
  }

  if (contentType?.startsWith("audio/")) {
    return (
      <ContentAudio media={mediaSrc} contentType={contentType as "audio/*"} />
    );
  }

  if (contentType?.startsWith("video/")) {
    return (
      <video
        src={mediaSrc?.src}
        autoPlay
        playsInline
        controls
        className="max-w-full max-h-full aspect-video"
      >
        Your browser does not support the video tag.
      </video>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center">
      <PipPlayerErrorMessage>Unable to read the file</PipPlayerErrorMessage>
    </div>
  );
}

function PipPlayerErrorMessage({ children }: React.PropsWithChildren) {
  return <span className="text-sm text-muted-foreground">{children}</span>;
}

export function StandaloneMediaView({
  mediaSrc,
  contentType,
}: {
  mediaSrc?: MediaObject;
  contentType: string | undefined | "unknwon";
}) {
  //
  //
  //
  if (contentType === "unknwon") {
    return (
      <div className="flex items-center justify-center h-full text-2xl">
        Unable to read the file
      </div>
    );
  }

  if (contentType) {
    const knwon = wellkown(contentType);
    switch (knwon) {
      case "image": {
        return mediaSrc?.srcset ? (
          <ProgressiveImage
            smallSrc={mediaSrc.srcset.thumbnail}
            largeSrc={mediaSrc.srcset.original}
            alt=""
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaSrc?.src}
            alt="Media"
            className="w-full h-full object-contain"
          />
        );
      }
      case "video": {
        return (
          <video
            src={mediaSrc?.src}
            controls
            className="max-w-full max-h-full aspect-video"
          >
            Your browser does not support the video tag.
          </video>
        );
      }
      case "audio": {
        return (
          <div className="w-full h-full flex items-center justify-center">
            <Card className="aspect-video">
              <CardHeader>
                <CardTitle>
                  <FileTypeIcon
                    type="audio"
                    className="inline mr-2 align-middle size-5"
                  />
                  Audio
                </CardTitle>
              </CardHeader>
              <CardContent className="w-full h-full flex items-center justify-center">
                <audio src={mediaSrc?.src} controls className="min-w-full">
                  Your browser does not support the audio tag.
                </audio>
              </CardContent>
            </Card>
          </div>
        );
      }
      case "pdf": {
        return (
          <object
            data={mediaSrc?.src}
            type="application/pdf"
            className="w-full h-full"
          />
        );
      }
    }
  }

  return (
    <div className="text-xs text-muted-foreground">
      Preview not available for this file type ({contentType})
    </div>
  );
}

const ProgressiveImage = ({
  smallSrc,
  largeSrc,
  alt,
}: {
  smallSrc: string;
  largeSrc: string;
  alt: string;
}) => {
  const [src, setSrc] = useState(smallSrc);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const img = new Image();
    img.src = largeSrc;
    img.onload = () => {
      setSrc(largeSrc);
      setIsLoaded(true);
      setIsLoading(false);
    };
  }, [largeSrc]);

  return (
    <>
      {isLoading && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 1,
          }}
        >
          <Spinner />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-contain"
        style={{
          filter: isLoaded ? "none" : "blur(10px)",
          transition: "filter 0.5s ease-in-out",
        }}
      />
    </>
  );
};

/**
 * head fetches the headers of a resource
 * @param src
 * @returns
 */
function head(src: string): Promise<{
  "content-type": string;
  "content-length"?: string;
  "last-modified"?: string;
  etag?: string;
  "accept-ranges"?: string;
  "cache-control"?: string;
  expires?: string;
  server?: string;
  date?: string;
  connection?: string;
  allow?: string;
}> {
  return fetch(src, {
    method: "HEAD",
  }).then((res) => {
    const contentType = res.headers.get("content-type");
    if (!contentType) {
      throw new Error("Content-Type header is missing");
    }
    return {
      "content-type": contentType,
      "content-length": res.headers.get("content-length") || undefined,
      "last-modified": res.headers.get("last-modified") || undefined,
      etag: res.headers.get("etag") || undefined,
      "accept-ranges": res.headers.get("accept-ranges") || undefined,
      "cache-control": res.headers.get("cache-control") || undefined,
      expires: res.headers.get("expires") || undefined,
      server: res.headers.get("server") || undefined,
      date: res.headers.get("date") || undefined,
      connection: res.headers.get("connection") || undefined,
      allow: res.headers.get("allow") || undefined,
    };
  });
}

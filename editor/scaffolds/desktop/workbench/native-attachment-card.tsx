"use client";

import { useEffect, useState } from "react";
import { ComposerAttachmentCard } from "@/kits/composer";
import { video_attachment } from "@/lib/agent-chat/video-attachment";

/**
 * The attachment a native chat draft carries, shown with the composer's own
 * attachment card. A PNG shows its thumbnail from a temporary object URL that
 * is released when the attachment changes; a video shows its poster frame,
 * duration and dimensions. A folder reference shows a folder card without a
 * size or an access-grant claim.
 */
export function NativeAttachmentCard({
  name,
  size,
  png,
  preview,
  mimeType,
  video,
  onRemove,
}: {
  name: string;
  size?: number;
  png: boolean;
  /** The PNG's bytes, or null for another file. */
  preview: Blob | null;
  mimeType?: string;
  /** A video's poster frame and facts. */
  video?: Partial<video_attachment.Preview>;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!preview) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(preview);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [preview]);
  return (
    <ComposerAttachmentCard
      attachment={{
        kind: "file",
        id: "native-draft",
        name,
        size,
        ...(png ? { mime: "image/png" } : mimeType && { mime: mimeType }),
        ...(url && { url }),
        ...(video?.poster && { poster: video.poster }),
        ...(video && { caption: video_attachment.caption(video) }),
      }}
      onRemove={onRemove}
    />
  );
}

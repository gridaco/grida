"use client";

import { useEffect, useState } from "react";
import { ComposerAttachmentCard } from "@/kits/composer";

/**
 * The attachment a native chat draft carries, shown with the composer's own
 * attachment card. A PNG shows its thumbnail from a temporary object URL that
 * is released when the attachment changes.
 */
export function NativeAttachmentCard({
  name,
  size,
  png,
  preview,
  onRemove,
}: {
  name: string;
  size: number;
  png: boolean;
  /** The PNG's bytes, or null for another file. */
  preview: Blob | null;
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
        ...(png && { mime: "image/png" }),
        ...(url && { url }),
      }}
      onRemove={onRemove}
    />
  );
}

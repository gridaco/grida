import React, { useState, useEffect } from "react";
import { useCurrentEditor } from "@/grida-canvas-react/use-editor";
import { cn } from "@/components/lib/utils";

type ImageState = "loading" | "empty" | "loaded";
// TODO: Update editor.getImage to accept size parameter for optimized image loading
type ImageSize = "original" | `${number}%` | `${number}px`;

/**
 * A React component that renders images from the Grida editor with loading and empty states.
 *
 * This component fetches images from the editor's image registry and displays them with
 * proper loading states and error handling. It supports custom loading and empty state
 * components that are rendered as-is without any wrapper elements.
 *
 * The size parameter allows for optimized image loading, particularly useful for property
 * control thumbnails where smaller images are more appropriate.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <ImageView src="image-id" />
 *
 * // With custom loading and empty states
 * <ImageView
 *   src="image-id"
 *   loading={<Spinner />}
 *   empty={<div>No image available</div>}
 * />
 *
 * // With size optimization for thumbnails
 * <ImageView
 *   src="image-id"
 *   size="16px"
 *   loading={<Spinner />}
 *   empty={<div>No image available</div>}
 * />
 * ```
 *
 * @param props - The component props
 * @param props.src - The image identifier from the editor's image registry
 * @param props.size - The desired size for the image ('original', percentage like '50%', or pixel size like '16px')
 * @param props.loading - Optional React node to display while the image is loading
 * @param props.empty - Optional React node to display when no image is available or loading fails
 * @param props.className - Additional CSS classes to apply to the image element
 * @param props...props - Additional props passed to the underlying img element
 *
 * @returns The rendered image element, loading state, empty state, or null
 */
export function ImageView({
  src,
  className,
  loading,
  empty,
  ...props
}: Omit<React.ComponentProps<"img">, "src" | "loading" | "empty"> & {
  src?: string;
  loading?: React.ReactNode;
  empty?: React.ReactNode;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [state, setState] = useState<ImageState>("empty");
  const editor = useCurrentEditor();

  useEffect(() => {
    if (!src) {
      setImageUrl(null);
      setState("empty");
      return;
    }

    const image = editor.getImage(src);
    if (!image) {
      setImageUrl(null);
      setState("empty");
      return;
    }

    setState("loading");

    image
      .getDataURL()
      .then((base64) => {
        setImageUrl(base64);
        setState("loaded");
      })
      .catch((error) => {
        console.error("Failed to load image:", error);
        setImageUrl(null);
        setState("empty");
      });
  }, [src, editor]);

  // Show loading state
  if (state === "loading" && loading) {
    return <>{loading}</>;
  }

  // Show empty state
  if (state === "empty" && empty) {
    return <>{empty}</>;
  }

  // Return null if no image and no empty state provided
  if (state !== "loaded") return null;

  if (!imageUrl) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Intentional: renders a canvas-exported data URL (Next/Image not applicable).
    <img
      className={cn("w-full h-full object-contain", className)}
      alt="Paint image"
      {...props}
      src={imageUrl}
    />
  );
}

"use client";

import React, { useMemo, useState } from "react";
import { useCurrentEditor, useEditorState } from "@/grida-canvas-react";
import { useSelectionState } from "@/grida-canvas-react/provider";
import { Button } from "@/components/ui-editor/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { dq } from "@/grida-canvas/query";
import cg from "@grida/cg";
import type grida from "@grida/schema";
import type { editor } from "@/grida-canvas";
import { editor as editorUtils } from "@/grida-canvas/editor.i";
import { ImageUpscale } from "lucide-react";
import { RemoveBackgroundIcon } from "../starterkit-icons/remove-background";
import {
  upscaleImage,
  removeBackgroundImage,
} from "@/app/(api)/private/ai/image/actions";
import type { Editor } from "@/grida-canvas/editor";

type ImageSelectionInfo = {
  node_id: string;
  paintTarget: "fill" | "stroke";
  paintIndex: number;
  paint: cg.ImagePaint;
};

/**
 * Finds the index of the topmost active image paint in the paints array.
 * Starts from the topmost (last in array) and searches backwards.
 * @param paints - Array of paints to search
 * @returns The index of the topmost active image paint, or -1 if not found
 */
function findTopmostActiveImagePaintIndex(paints: cg.Paint[]): number {
  const topmostIndex = editorUtils.getTopmostFillIndex(paints);
  for (let i = topmostIndex; i >= 0; i--) {
    const paint = paints[i];
    if (paint?.type === "image" && paint?.active !== false) {
      return i;
    }
  }
  return -1;
}

/**
 * Checks if the current selection is a single image node
 * (not a container with children, but containers with 0 children are OK)
 */
function isImageNodeSelection(
  editor: ReturnType<typeof useCurrentEditor>,
  selection: string[],
  document_ctx: editor.state.IEditorState["document_ctx"],
  node: grida.program.nodes.Node | null
): ImageSelectionInfo | null {
  // Must have exactly 1 selection
  if (selection.length !== 1) {
    return null;
  }

  const node_id = selection[0]!;

  if (!node) {
    return null;
  }

  // Check if node is a container with children (containers with 0 children are OK)
  const children = dq.getChildren(document_ctx, node_id);
  if (children.length > 0) {
    return null;
  }

  // Check fill_paints array first - find topmost active image paint
  const fillPaints = Array.isArray((node as any).fill_paints)
    ? ((node as any).fill_paints as cg.Paint[])
    : (node as any).fill
      ? [(node as any).fill as cg.Paint]
      : [];
  const fillImageIndex = findTopmostActiveImagePaintIndex(fillPaints);
  if (fillImageIndex !== -1) {
    const paint = fillPaints[fillImageIndex] as cg.ImagePaint;
    return {
      node_id,
      paintTarget: "fill",
      paintIndex: fillImageIndex,
      paint,
    };
  }

  // Check stroke_paints array - find topmost active image paint
  const strokePaints = Array.isArray((node as any).stroke_paints)
    ? ((node as any).stroke_paints as cg.Paint[])
    : (node as any).stroke
      ? [(node as any).stroke as cg.Paint]
      : [];
  const strokeImageIndex = findTopmostActiveImagePaintIndex(strokePaints);
  if (strokeImageIndex !== -1) {
    const paint = strokePaints[strokeImageIndex] as cg.ImagePaint;
    return {
      node_id,
      paintTarget: "stroke",
      paintIndex: strokeImageIndex,
      paint,
    };
  }

  return null;
}

/**
 * Extracts base64 image data from the image reference
 */
async function extractImageBase64(
  editor: Editor,
  imageRef: string
): Promise<string> {
  const image = editor.getImage(imageRef);
  if (!image) {
    throw new Error("Failed to load image");
  }

  const dataURL = await image.getDataURL();
  // Extract base64 from data URL
  return dataURL.includes(",") ? dataURL.split(",")[1]! : dataURL;
}

/**
 * Handles API error responses with appropriate toast messages
 */
function handleApiError(
  result: { success: false; status: number; message: string },
  defaultMessage: string
): void {
  if (result.status === 401) {
    toast.error("Login required");
  } else {
    toast.error(result.message || defaultMessage);
  }
}

/**
 * Gets current paints for a node (fill or stroke)
 */
function getCurrentPaints(
  node: grida.program.nodes.Node,
  paintTarget: "fill" | "stroke"
): cg.Paint[] {
  if (paintTarget === "fill") {
    return Array.isArray((node as any).fill_paints)
      ? ((node as any).fill_paints as cg.Paint[])
      : (node as any).fill
        ? [(node as any).fill as cg.Paint]
        : [];
  } else {
    return Array.isArray((node as any).stroke_paints)
      ? ((node as any).stroke_paints as cg.Paint[])
      : (node as any).stroke
        ? [(node as any).stroke as cg.Paint]
        : [];
  }
}

/**
 * Updates the node with the processed image:
 * - Deactivates the topmost visible image fill
 * - Adds the new processed image on top
 */
function updateNodeWithProcessedImage(
  editor: ReturnType<typeof useCurrentEditor>,
  imageInfo: ImageSelectionInfo,
  newImageUrl: string
): void {
  // Get current state to update paints
  const currentState = editor.getSnapshot();
  const node = currentState.document.nodes[imageInfo.node_id];
  if (!node) {
    throw new Error("Node not found");
  }

  // Get current paints
  const currentPaints = getCurrentPaints(node, imageInfo.paintTarget);

  // Find the topmost visible (active=true) image fill
  const activeImageIndex = findTopmostActiveImagePaintIndex(currentPaints);
  if (activeImageIndex === -1) {
    throw new Error("No active image paint found");
  }

  // Create updated paints: deactivate the found image, keep all others
  const updatedPaints = currentPaints.map((paint, index) => {
    if (index === activeImageIndex) {
      return { ...paint, active: false };
    }
    return paint;
  });

  // Create new processed image paint
  const newImagePaint: cg.ImagePaint = {
    ...imageInfo.paint,
    src: newImageUrl,
    active: true,
  };

  // Add the new image at the end (topmost position)
  updatedPaints.push(newImagePaint);

  // Apply the changes
  if (imageInfo.paintTarget === "fill") {
    editor.commands.changeNodePropertyFills(imageInfo.node_id, updatedPaints);
  } else {
    editor.commands.changeNodePropertyStrokes(imageInfo.node_id, updatedPaints);
  }
}

interface ToolbarButtonWithLoadingProps {
  icon: React.ReactNode;
  label: string;
  tooltip: string;
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
}

function ToolbarButtonWithLoading({
  icon,
  label,
  tooltip,
  onClick,
  loading,
  disabled,
}: ToolbarButtonWithLoadingProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          onClick={onClick}
          disabled={loading || disabled}
          className="gap-2"
        >
          {loading ? <Spinner className="w-3.5 h-3.5" /> : icon}
          <span className="text-xs">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function ImageToolbar() {
  const editor = useCurrentEditor();
  const { selection } = useSelectionState();
  const document_ctx = useEditorState(editor, (state) => state.document_ctx);

  // Only re-render when selection or document_ctx changes, not when node properties change
  // Get node from snapshot inside useMemo to avoid subscribing to all node changes
  const imageInfo = useMemo(() => {
    if (selection.length !== 1) {
      return null;
    }
    const node_id = selection[0]!;
    const node = editor.commands.getNodeSnapshotById(node_id);
    return isImageNodeSelection(editor, selection, document_ctx, node);
  }, [editor, selection, document_ctx]);

  const [upscaling, setUpscaling] = useState(false);
  const [removingBackground, setRemovingBackground] = useState(false);

  // Don't render if no image selection
  if (!imageInfo) {
    return null;
  }

  const handleUpscale = async () => {
    if (!imageInfo) return;

    setUpscaling(true);
    try {
      // Get fresh node state to ensure we use the latest paints
      const node_id = selection[0]!;
      const node = editor.commands.getNodeSnapshotById(node_id);
      const currentImageInfo = isImageNodeSelection(
        editor,
        selection,
        document_ctx,
        node
      );

      if (!currentImageInfo) {
        toast.error("No active image found");
        return;
      }

      const imageRef = currentImageInfo.paint.src;
      if (!imageRef) {
        toast.error("Image reference not found");
        return;
      }

      const base64 = await extractImageBase64(editor, imageRef);

      const result = await upscaleImage({
        image: { kind: "base64", base64 },
        scale: 4,
      });

      if (!result.success) {
        handleApiError(result, "Failed to upscale image");
        return;
      }

      if (result.data.image.kind !== "url") {
        toast.error("Invalid response format from server");
        return;
      }

      const resultUrl = result.data.image.url;
      if (!resultUrl) {
        toast.error("Invalid response from server");
        return;
      }

      const newImageRef = await editor.createImageAsync(resultUrl);
      updateNodeWithProcessedImage(editor, currentImageInfo, newImageRef.url);

      toast.success("Image upscaled successfully");
    } catch (error) {
      console.error("Upscale error:", error);
      toast.error("Failed to upscale image");
    } finally {
      setUpscaling(false);
    }
  };

  const handleRemoveBackground = async () => {
    if (!imageInfo) return;

    setRemovingBackground(true);
    try {
      // Get fresh node state to ensure we use the latest paints
      const node_id = selection[0]!;
      const node = editor.commands.getNodeSnapshotById(node_id);
      const currentImageInfo = isImageNodeSelection(
        editor,
        selection,
        document_ctx,
        node
      );

      if (!currentImageInfo) {
        toast.error("No active image found");
        return;
      }

      const imageRef = currentImageInfo.paint.src;
      if (!imageRef) {
        toast.error("Image reference not found");
        return;
      }

      const base64 = await extractImageBase64(editor, imageRef);

      const result = await removeBackgroundImage({
        image: { kind: "base64", base64 },
        format: "png",
        background_type: "rgba",
      });

      if (!result.success) {
        handleApiError(result, "Failed to remove background");
        return;
      }

      if (result.data.image.kind !== "url") {
        toast.error("Invalid response format from server");
        return;
      }

      const resultUrl = result.data.image.url;
      if (!resultUrl) {
        toast.error("Invalid response from server");
        return;
      }

      const newImageRef = await editor.createImageAsync(resultUrl);
      updateNodeWithProcessedImage(editor, currentImageInfo, newImageRef.url);

      toast.success("Background removed successfully");
    } catch (error) {
      console.error("Remove background error:", error);
      toast.error("Failed to remove background");
    } finally {
      setRemovingBackground(false);
    }
  };

  return (
    <div className="relative bottom-2 w-full flex justify-center">
      <div className="rounded-full flex justify-center items-center gap-2 border bg-background shadow px-3 py-1 pointer-events-auto select-none">
        <ToolbarButtonWithLoading
          icon={<ImageUpscale className="w-3.5 h-3.5" />}
          label="Upscale"
          tooltip="Upscale Image"
          onClick={handleUpscale}
          loading={upscaling}
          disabled={removingBackground}
        />
        <ToolbarButtonWithLoading
          icon={<RemoveBackgroundIcon className="w-3.5 h-3.5" />}
          label="Remove background"
          tooltip="Remove Background"
          onClick={handleRemoveBackground}
          loading={removingBackground}
          disabled={upscaling}
        />
      </div>
    </div>
  );
}

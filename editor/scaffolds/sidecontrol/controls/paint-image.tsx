import React, { useState, useCallback, useEffect } from "react";
import { PropertySlider } from "./utils/slider-fat";
import { Button } from "@/components/ui-editor/button";
import { BoxFitControl } from "./box-fit";
import { RotateCwIcon, UploadIcon } from "lucide-react";
import { ImageIcon } from "@radix-ui/react-icons";
import { useFilePicker } from "use-file-picker";
import { useCurrentEditor, ImageView } from "@/grida-canvas-react";
import cg from "@grida/cg";
import cmath from "@grida/cmath";

/**
 * Custom hook for handling image upload functionality
 */
function useImageUpload(onImageUploaded: (imageUrl: string) => void) {
  const [isUploading, setIsUploading] = useState(false);
  const editor = useCurrentEditor();

  const { openFilePicker, plainFiles } = useFilePicker({
    accept: "image/png,image/jpeg,image/webp,image/gif",
    multiple: false,
  });

  // Handle file upload when files change
  useEffect(() => {
    if (plainFiles.length > 0) {
      const file = plainFiles[0];
      setIsUploading(true);

      // Convert File to Uint8Array
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const arrayBuffer = reader.result as ArrayBuffer;
          const uint8Array = new Uint8Array(arrayBuffer);

          // Create image in editor
          const imageRef = await editor.createImage(
            uint8Array,
            undefined,
            file.type
          );

          // Call the callback with the new image URL
          onImageUploaded(imageRef.url);
        } catch (error) {
          console.error("Failed to create image:", error);
        } finally {
          setIsUploading(false);
        }
      };

      reader.onerror = () => {
        console.error("Failed to read file");
        setIsUploading(false);
      };

      reader.readAsArrayBuffer(file);
    }
  }, [plainFiles, editor, onImageUploaded]);

  return {
    openFilePicker,
    isUploading,
  };
}

const IMAGE_FILTERS = [
  {
    key: "exposure",
    label: "Exposure",
    min: 0.25,
    max: 4.0,
    step: 0.05,
    defaultValue: 1.0,
  },
  {
    key: "contrast",
    label: "Contrast",
    min: 0.25,
    max: 4.0,
    step: 0.01,
    defaultValue: 1.0,
  },
  {
    key: "saturation",
    label: "Saturation",
    min: 0.0,
    max: 2.0,
    step: 0.01,
    defaultValue: 1.0,
  },
  {
    key: "temperature",
    label: "Temperature",
    min: -0.4,
    max: 0.4,
    step: 0.01,
    defaultValue: 0.0,
  },
  {
    key: "tint",
    label: "Tint",
    min: 0.6,
    max: 1.4,
    step: 0.01,
    defaultValue: 1.0,
  },
  // { key: "highlights", label: "Highlights" },
  // { key: "shadows", label: "Shadows" },
] as const;

/**
 * Image preview component with upload functionality
 */
interface ImagePreviewProps {
  value: cg.ImagePaint;
  onImageUpload: () => void;
  isUploading: boolean;
}

function ImagePreview({
  value,
  onImageUpload,
  isUploading,
}: ImagePreviewProps) {
  const Image = ImageView({ src: value.src });

  return (
    <div className="relative w-full aspect-square bg-muted rounded-md border overflow-hidden group select-none">
      {Image ? (
        Image
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-muted-foreground/5">
          <div className="text-center">
            <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">No image</p>
          </div>
        </div>
      )}

      {/* Hover Controls */}
      <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 px-8 py-4 transition-opacity duration-200 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
        <Button
          onClick={onImageUpload}
          size="xs"
          className="w-full"
          disabled={isUploading}
        >
          <UploadIcon className="w-4 h-4 mr-2" />
          {isUploading ? "Uploading..." : "Choose Image..."}
        </Button>
        {/* <Button
            onClick={() => {
              // TODO: Implement "Make an image" functionality
              console.log("Make an image clicked");
            }}
            size="xs"
            variant="outline"
            className="w-full"
          >
            <ImageIcon className="w-4 h-4 mr-2" />
            Make an image
          </Button> */}
      </div>
    </div>
  );
}

export interface ImagePaintControlProps {
  value: cg.ImagePaint;
  onValueChange?: (value: cg.ImagePaint) => void;
}

export function ImagePaintControl({
  value,
  onValueChange,
}: ImagePaintControlProps) {
  // Handle image upload with the new hook
  const handleImageUploaded = useCallback(
    (imageUrl: string) => {
      onValueChange?.({
        type: "image",
        src: imageUrl,
        fit: value.fit,
        transform: value.transform,
        filters: value.filters,
        blendMode: value.blendMode,
        opacity: value.opacity,
      });
    },
    [onValueChange, value.fit, value.transform, value.filters, value.blendMode]
  );

  const { openFilePicker, isUploading } = useImageUpload(handleImageUploaded);

  const handleImageUpload = useCallback(() => {
    openFilePicker();
  }, [openFilePicker]);

  const handleRotate = useCallback(() => {
    if (!value.src) return; // Don't update if no image source

    // For now, we'll store rotation as a separate property for UI purposes
    // In the future, this should be handled through the transform matrix
    const currentRotation = (value as any)?.rotation || 0;
    const newRotation = (currentRotation + 90) % 360;

    onValueChange?.({
      type: "image",
      src: value.src,
      fit: value.fit,
      transform: value.transform,
      filters: value.filters,
      blendMode: value.blendMode,
      rotation: newRotation,
    } as any);
  }, [value, onValueChange]);

  const handleFilterChange = useCallback(
    (
      filterName: keyof NonNullable<cg.ImagePaint["filters"]>,
      newValue: number
    ) => {
      if (!value.src) return; // Don't update if no image source

      onValueChange?.({
        type: "image",
        src: value.src,
        fit: value.fit,
        transform: value.transform,
        filters: {
          ...value.filters,
          [filterName]: newValue,
        },
        blendMode: value.blendMode,
        opacity: value.opacity,
      });
    },
    [value, onValueChange]
  );

  const handleBoxFitChange = useCallback(
    (fit: cg.BoxFit) => {
      if (!value.src) return; // Don't update if no image source

      onValueChange?.({
        type: "image",
        src: value.src,
        fit,
        transform: value.transform,
        filters: value.filters,
        blendMode: value.blendMode,
        opacity: value.opacity,
      });
    },
    [value, onValueChange]
  );

  const defaultFilters = {
    exposure: 1.0,
    contrast: 1.0,
    saturation: 1.0,
    temperature: 0.0,
    tint: 1.0,
    highlights: 0,
    shadows: 0,
  };

  const filters = { ...defaultFilters, ...value.filters };

  return (
    <div className="w-full space-y-4">
      {/* Header with Box Fit and Rotate */}
      <div className="flex items-center justify-between gap-8">
        <BoxFitControl
          value={value.fit}
          onValueChange={handleBoxFitChange}
          className="w-24"
        />
        <Button
          onClick={handleRotate}
          title="Rotate"
          variant="ghost"
          size="icon"
        >
          <RotateCwIcon className="size-3.5" />
        </Button>
      </div>

      {/* Image Preview */}
      <ImagePreview
        value={value}
        onImageUpload={handleImageUpload}
        isUploading={isUploading}
      />

      {/* Edit Image Button */}
      {/* <Button
        onClick={() => {
          // TODO: Implement image editing functionality
          console.log("Edit image clicked");
        }}
        variant="outline"
        className="w-full"
      >
        <Wand2Icon className="w-4 h-4 mr-2" />
        Edit image
      </Button> */}

      {/* Image Filters */}
      <div className="space-y-3">
        {IMAGE_FILTERS.map(({ key, label, min, max, step, defaultValue }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-20 truncate">
              {label}
            </span>
            <PropertySlider
              min={min}
              max={max}
              step={step}
              defaultValue={defaultValue}
              marks={[defaultValue]}
              value={filters[key as keyof typeof filters]}
              onValueChange={(value) =>
                handleFilterChange(
                  key as keyof NonNullable<cg.ImagePaint["filters"]>,
                  value
                )
              }
              onValueCommit={(value) =>
                handleFilterChange(
                  key as keyof NonNullable<cg.ImagePaint["filters"]>,
                  value
                )
              }
              className="flex-1"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

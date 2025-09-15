import React, { useState, useCallback } from "react";
import { cn } from "@/components/lib/utils";
import { Slider } from "./utils/slider";
import { Button } from "@/components/ui-editor/button";
import { BoxFitControl } from "./box-fit";
import { RotateCwIcon, UploadIcon, Wand2Icon } from "lucide-react";
import { ImageIcon } from "@radix-ui/react-icons";
import { useFilePicker } from "use-file-picker";
import cg from "@grida/cg";

const IMAGE_FILTERS = [
  { key: "exposure", label: "Exposure" },
  { key: "contrast", label: "Contrast" },
  { key: "saturation", label: "Saturation" },
  { key: "temperature", label: "Temperature" },
  { key: "tint", label: "Tint" },
  { key: "highlights", label: "Highlights" },
  { key: "shadows", label: "Shadows" },
] as const;

export interface ImagePaintControlProps {
  value?: cg.ImagePaint;
  onValueChange?: (value: cg.ImagePaint) => void;
}

export function ImagePaintControl({
  value,
  onValueChange,
}: ImagePaintControlProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { openFilePicker } = useFilePicker({
    accept: "image/*",
    multiple: false,
  });

  const handleImageUpload = useCallback(() => {
    openFilePicker();
  }, [openFilePicker]);

  const handleRotate = useCallback(() => {
    // For now, we'll store rotation as a separate property for UI purposes
    // In the future, this should be handled through the transform matrix
    const currentRotation = (value as any)?.rotation || 0;
    const newRotation = (currentRotation + 90) % 360;

    onValueChange?.({
      ...value,
      type: "image",
      rotation: newRotation,
    } as any);
  }, [value, onValueChange]);

  const handleFilterChange = useCallback(
    (
      filterName: keyof NonNullable<cg.ImagePaint["filters"]>,
      newValue: number
    ) => {
      onValueChange?.({
        ...value,
        type: "image",
        filters: {
          ...value?.filters,
          [filterName]: newValue,
        },
      });
    },
    [value, onValueChange]
  );

  const handleBoxFitChange = useCallback(
    (fit: cg.BoxFit) => {
      onValueChange?.({
        ...value,
        type: "image",
        fit,
      });
    },
    [value, onValueChange]
  );

  const defaultFilters = {
    exposure: 0,
    contrast: 0,
    saturation: 0,
    temperature: 0,
    tint: 0,
    highlights: 0,
    shadows: 0,
  };

  const filters = { ...defaultFilters, ...value?.filters };

  return (
    <div className="w-full space-y-4">
      {/* Header with Box Fit and Rotate */}
      <div className="flex items-center justify-between">
        <BoxFitControl
          value={value?.fit || "cover"}
          onValueChange={handleBoxFitChange}
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

      {/* Image Box */}
      <div
        className="relative w-full aspect-square bg-muted rounded-md border overflow-hidden group"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {value?.src ? (
          <img
            src={value.src}
            alt="Paint image"
            className="w-full h-full object-cover"
            style={{
              objectFit: value.fit || "none",
              transform: (value as any).rotation
                ? `rotate(${(value as any).rotation}deg)`
                : undefined,
              filter: value.filters
                ? `brightness(${1 + (filters.exposure || 0) / 100}) contrast(${1 + (filters.contrast || 0) / 100}) saturate(${1 + (filters.saturation || 0) / 100}) hue-rotate(${(filters.temperature || 0) * 3.6}deg) sepia(${(filters.tint || 0) / 100})`
                : undefined,
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted-foreground/5">
            <div className="text-center">
              <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">No image</p>
            </div>
          </div>
        )}

        {/* Hover Controls */}
        <div
          className={cn(
            "absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 px-8 py-4 transition-opacity duration-200",
            isHovered ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          <Button onClick={handleImageUpload} size="xs" className="w-full">
            <UploadIcon className="w-4 h-4 mr-2" />
            Upload from computer
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
        {IMAGE_FILTERS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-20 truncate">
              {label}
            </span>
            <Slider
              min={-100}
              max={100}
              step={1}
              value={[filters[key as keyof typeof filters]]}
              onValueChange={([value]) =>
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

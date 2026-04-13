"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  useSlideEditorMode,
  useSlides,
  useCurrentSlide,
} from "@/grida-canvas-react/use-slide-editor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SlideExportFileType = "pdf" | "png" | "svg";
export type SlideExportColorProfile = "srgb";
export type SlideExportQuality = "low" | "medium" | "high";
export type SlideExportContent = "all" | "selected";

export interface SlideExportOptions {
  fileType: SlideExportFileType;
  colorProfile: SlideExportColorProfile;
  quality: SlideExportQuality;
  content: SlideExportContent;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILE_TYPE_LABELS: Record<SlideExportFileType, string> = {
  pdf: "PDF",
  png: "PNG",
  svg: "SVG",
};

const QUALITY_LABELS: Record<SlideExportQuality, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export function SlideExportDialog({
  open,
  onOpenChange,
  onExport,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onExport: (options: SlideExportOptions) => void;
}) {
  const mode = useSlideEditorMode();
  const slides = useSlides(mode);
  const current = useCurrentSlide(mode);

  const [fileType, setFileType] = useState<SlideExportFileType>("pdf");
  const [colorProfile] = useState<SlideExportColorProfile>("srgb");
  const [quality, setQuality] = useState<SlideExportQuality>("medium");
  const [content, setContent] = useState<SlideExportContent>("all");

  const selectedSlideCount = current ? 1 : 0;
  const totalSlideCount = slides.length;

  const title = `Export slides to ${FILE_TYPE_LABELS[fileType]}`;
  const description =
    content === "all"
      ? `${totalSlideCount} slide${totalSlideCount !== 1 ? "s" : ""} will be exported.`
      : `${selectedSlideCount} selected slide${selectedSlideCount !== 1 ? "s" : ""} will be exported.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-4 py-4">
          {/* File type */}
          <Label className="text-sm text-muted-foreground">File type</Label>
          <Select
            value={fileType}
            onValueChange={(v) => setFileType(v as SlideExportFileType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FILE_TYPE_LABELS) as SlideExportFileType[]).map(
                (ft) => (
                  <SelectItem key={ft} value={ft}>
                    {FILE_TYPE_LABELS[ft]}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>

          {/* Color profile */}
          <Label className="text-sm text-muted-foreground">Color profile</Label>
          <Select value={colorProfile} disabled>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="srgb">sRGB (same as file)</SelectItem>
            </SelectContent>
          </Select>

          {/* Quality */}
          <Label className="text-sm text-muted-foreground">Quality</Label>
          <Select
            value={quality}
            onValueChange={(v) => setQuality(v as SlideExportQuality)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(QUALITY_LABELS) as SlideExportQuality[]).map(
                (q) => (
                  <SelectItem key={q} value={q}>
                    {QUALITY_LABELS[q]}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>

          {/* Content */}
          <Label className="text-sm text-muted-foreground">Content</Label>
          <RadioGroup
            value={content}
            onValueChange={(v) => setContent(v as SlideExportContent)}
            className="flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="all" id="export-all" />
              <Label htmlFor="export-all" className="text-sm font-normal">
                All slides
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem
                value="selected"
                id="export-selected"
                disabled={selectedSlideCount === 0}
              />
              <Label htmlFor="export-selected" className="text-sm font-normal">
                {selectedSlideCount} selected slide
                {selectedSlideCount !== 1 ? "s" : ""}
              </Label>
            </div>
          </RadioGroup>
        </div>
        <DialogFooter>
          <Button
            onClick={() =>
              onExport({ fileType, colorProfile, quality, content })
            }
          >
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import type React from "react";

import Image from "next/image";
import { cn } from "@/utils";
import { Button } from "@/components/ui/button";

interface SocialPreviewSectionProps {
  ogImage: string | null;
  getPublicUrl: (path: string) => string;
  onFileUpload?: (file: File) => Promise<boolean>;
}

export function SocialPreviewSection({
  ogImage,
  getPublicUrl,
  onFileUpload,
}: SocialPreviewSectionProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left column with label and info */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Social Preview</h2>
          <p className="text-sm text-gray-500">1200 × 630 pixels</p>
          <div className="pt-2">
            <Button variant="outline" size="sm" className="w-24" asChild>
              <label htmlFor="social-preview-upload">
                Upload
                <input
                  id="social-preview-upload"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    if (e.target.files?.length === 1) {
                      onFileUpload?.(e.target.files?.[0] as File);
                    }
                  }}
                />
              </label>
            </Button>
          </div>
        </div>

        {/* Right column with preview */}
        <div className="md:col-span-2">
          <div
            className={cn(
              "w-full aspect-[1200/630] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted",
              ogImage ? "border-transparent" : "border-border"
            )}
          >
            {ogImage ? (
              <div className="relative w-full h-full rounded-lg overflow-hidden">
                <Image
                  src={getPublicUrl(ogImage)}
                  alt="Social Preview"
                  width={1200}
                  height={630}
                  className="object-cover w-full h-full"
                />
              </div>
            ) : (
              <div className="text-center text-xs text-muted-foreground">
                <p>Drop image</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

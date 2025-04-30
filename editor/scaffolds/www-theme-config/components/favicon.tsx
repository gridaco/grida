"use client";

import type React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface FaviconSectionProps {
  favicon: { src: string; srcDark?: string | undefined } | null;
  onFileUpload?: (file: File, variant: "src" | "srcDark") => Promise<boolean>;
  getPublicUrl: (path: string) => string;
}

export function FaviconEditor({
  getPublicUrl,
  favicon,
  onFileUpload,
}: FaviconSectionProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left column with label and info */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Favicon</h2>
          <p className="text-sm text-gray-500">64 × 64 pixels</p>
        </div>

        {/* Right column with previews */}
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Light Theme Preview */}
          <div className="flex flex-col items-center gap-2">
            <FaviconPreview
              favicon={favicon?.src ? getPublicUrl(favicon.src) : null}
            />
            <p className="text-sm text-center">Light Theme</p>
            <p className="text-xs text-center text-gray-500">64 × 64 pixels</p>
            <div className="flex justify-center">
              <Button variant="outline" size="sm" className="w-24" asChild>
                <label htmlFor="favicon-upload">
                  Upload
                  <input
                    id="favicon-upload"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.files?.length === 1) {
                        onFileUpload?.(e.target.files?.[0] as File, "src");
                      }
                    }}
                  />
                </label>
              </Button>
            </div>
          </div>

          {/* Dark Theme Preview */}
          <div className="flex flex-col items-center gap-2">
            <FaviconPreview
              dark
              favicon={
                favicon?.srcDark || favicon?.src
                  ? getPublicUrl(favicon?.srcDark || favicon?.src)
                  : null
              }
            />
            <p className="text-sm text-center">Dark Theme</p>
            <p className="text-xs text-center text-gray-500">64 × 64 pixels</p>
            <div className="flex justify-center">
              <Button variant="outline" size="sm" className="w-24" asChild>
                <label htmlFor="favicon-dark-upload">
                  Upload
                  <input
                    id="favicon-dark-upload"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.files?.length === 1) {
                        onFileUpload?.(e.target.files?.[0] as File, "srcDark");
                      }
                    }}
                  />
                </label>
              </Button>
            </div>
          </div>
        </div>
      </div>
      <Separator />
    </div>
  );
}

function FaviconPreview({
  dark,
  favicon,
}: {
  favicon?: string | null;
  dark?: boolean;
}) {
  const background = dark
    ? "/assets/favicon-preview-dark.png"
    : "/assets/favicon-preview.png";

  const fallback = dark
    ? "/logos/grida-favicon-dark.png"
    : "/logos/grida-favicon.png";

  return (
    <div className="relative w-[180px] h-[110px] rounded-xl overflow-hidden border">
      <div className="absolute top-[23px] left-[60px] w-10 h-9 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={favicon ?? fallback}
          width={16}
          height={16}
          alt="favicon"
          className="w-4 h-4"
        />
      </div>
      <Image src={background} width={360} height={220} alt="favicon preview" />
    </div>
  );
}

"use client";

import type React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { FileIO } from "@/lib/file";

type Logo = {
  src: string;
  srcDark?: string | undefined;
};

export function NavbarLogoEditor({
  logo,
  uploader,
  onLogoChange,
  getPublicUrl = (path: string) => path,
}: {
  logo?: Logo | null;
  uploader: (
    file: File,
    type: "src" | "srcDark"
  ) => Promise<FileIO.UploadResult>;
  onLogoChange?: (file: FileIO.UploadResult, type: "src" | "srcDark") => void;
  getPublicUrl?: (path: string) => string;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left column with label and info */}
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Navbar Logo</h2>
          <p className="text-sm text-gray-500">
            64x64 ~ 256×64 pixels.
            <br />
            Use SVG for best speed.
          </p>
        </div>

        {/* Right column with previews */}
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Light Theme Preview */}
          <div className="flex flex-col items-center gap-2">
            <LogoPreview
              logo={logo?.src ? getPublicUrl(logo.src) : undefined}
            />
            <p className="text-sm text-center">Light Theme</p>
            <p className="text-xs text-center text-gray-500">
              Use SVG for best speed
            </p>
            <div className="flex justify-center">
              <Button variant="outline" size="sm" className="w-24" asChild>
                <label htmlFor="logo-upload">
                  Upload
                  <input
                    id="logo-upload"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        uploader(e.target.files[0], "src").then((r) => {
                          onLogoChange?.(r, "src");
                        });
                      }
                    }}
                  />
                </label>
              </Button>
            </div>
          </div>

          {/* Dark Theme Preview */}
          <div className="flex flex-col items-center gap-2">
            <LogoPreview
              logo={
                logo?.srcDark || logo?.src
                  ? getPublicUrl(logo?.srcDark || logo?.src)
                  : undefined
              }
              dark
            />
            <p className="text-sm text-center">Dark Theme</p>
            <p className="text-xs text-center text-gray-500">
              Use SVG for best speed
            </p>
            <div className="flex justify-center">
              <Button variant="outline" size="sm" className="w-24" asChild>
                <label htmlFor="logo-dark-upload">
                  Upload
                  <input
                    id="logo-dark-upload"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        uploader(e.target.files[0], "srcDark").then((r) => {
                          onLogoChange?.(r, "srcDark");
                        });
                      }
                    }}
                  />
                </label>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogoPreview({ dark, logo }: { logo?: string | null; dark?: boolean }) {
  const background = dark
    ? "/assets/logo-preview-dark.png"
    : "/assets/logo-preview.png";

  const fallback = dark ? "/logos/grida-dark.png" : "/logos/grida.png";

  return (
    <div className="relative w-[180px] h-[110px] rounded-xl overflow-hidden border">
      <div className="absolute top-[23px] left-[23px] max-w-full h-9 flex items-center justify-center">
        <Image
          src={logo ?? fallback}
          width={160}
          height={40}
          alt="logo"
          className="w-auto h-4"
        />
      </div>
      <Image src={background} width={360} height={220} alt="logo preview" />
    </div>
  );
}

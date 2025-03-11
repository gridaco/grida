import React from "react";
import Image from "next/image";
import Footer from "@/www/footer";
import Header from "@/www/header";
import { Button } from "@/components/ui/button";
import { Apple } from "@/components/logos/apple";
import { Windows } from "@/components/logos/windows";
import { Linux } from "@/components/logos/linux";
import Link from "next/link";
import { sitemap } from "@/www/data/sitemap";
import type { Metadata } from "next";
import { downloads } from "./downloads";
import { headers } from "next/headers";
import { DownloadIcon } from "@radix-ui/react-icons";

export const metadata: Metadata = {
  title: "Downloads",
  description: "Download Grida",
  keywords: "Grida, download, desktop, design, tool, editor",
};

const oslabel = {
  mac: "macOS",
  windows: "Windows",
  linux: "Linux",
};

function OSIcon({
  os,
  className,
}: {
  os: "mac" | "windows" | "linux";
  className?: string;
}) {
  switch (os) {
    case "mac":
      return <Apple className={className} />;
    case "windows":
      return <Windows className={className} />;
    case "linux":
      return <Linux className={className} />;
    default:
      return null;
  }
}

export default async function DownloadsPage() {
  const headersList = await headers();
  const userAgent = headersList.get("user-agent");

  const os = downloads.getDesktopOS(userAgent || "");
  const links = await downloads.getLinks_v001(os);

  return (
    <main className="min-h-screen flex flex-col">
      <Header />
      <div className="h-60" />
      <main className="container items-center">
        <section className="container bg-background max-w-xl lg:max-w-7xl mx-auto py-8 px-12 lg:px-16 lg:py-10 xl:py-2 text-left border rounded-lg flex flex-col-reverse lg:flex-row items-center justify-between overflow-hidden">
          <div className="max-w-lg text-center lg:text-left">
            <h1 className="text-black text-4xl md:text-6xl font-bold mb-16 lg:mb-24">
              Download <br />
              Grida for Desktop
            </h1>
            <div>
              <div className="flex justify-center lg:justify-start space-x-4">
                {os ? (
                  <Link href={links.default!.url}>
                    <Button size="lg">
                      <OSIcon os={os} className="mr-2 size-4" /> Download for{" "}
                      {oslabel[os]}
                    </Button>
                  </Link>
                ) : (
                  <Link href={sitemap.links.releases_latest}>
                    <Button size="lg">
                      <DownloadIcon className="mr-2 size-4" /> Download
                    </Button>
                  </Link>
                )}
              </div>
              <p className="mt-4 text-sm text-muted-foreground text-center lg:text-left">
                <Link
                  href="https://github.com/gridaco/grida/releases/latest"
                  target="_blank"
                  className="underline"
                >
                  View all releases on GitHub
                </Link>
              </p>
            </div>
          </div>

          <div className="w-full h-full md:w-1/2 flex justify-center md:justify-end mt-10 md:mt-0">
            <Image
              src="/images/download.png"
              width={600}
              height={400}
              alt="download"
              className="object-contain hover:scale-110 transition-all duration-300"
            />
          </div>
        </section>
      </main>
      <div className="h-32" />
      <div className="container w-full items-center">
        <h1 className="text-center text-3xl font-semibold mb-6">
          Download Grida for desktop
        </h1>
        <p className="text-center text-base text-muted-foreground mb-12">
          A faster, more focused experience awaits.
        </p>
        <DownloadButtons links={links} />
        <p className="mt-4 text-sm text-muted-foreground text-center">
          <Link
            href="https://github.com/gridaco/grida/releases/latest"
            target="_blank"
            className="underline"
          >
            View all releases on GitHub
          </Link>
        </p>
      </div>
      <div className="h-96" />
      <Footer />
    </main>
  );
}

function DownloadButtons({ links }: { links: downloads.DownloadLinks }) {
  return (
    <div className="container max-w-3xl flex flex-wrap justify-center gap-3 mx-auto">
      {/* macOS Universal */}
      <Link href={links.mac_dmg_universal} download>
        <Button size="lg" variant="outline">
          <Apple className="mr-2 size-4" /> Download for macOS (Universal)
        </Button>
      </Link>

      {/* macOS Apple Silicon */}
      <Link href={links.mac_dmg_arm64} download>
        <Button size="lg" variant="outline">
          <Apple className="mr-2 size-4" /> Download for macOS (Apple Silicon)
        </Button>
      </Link>

      {/* macOS Intel */}
      <Link href={links.mac_dmg_x64} download>
        <Button size="lg" variant="outline">
          <Apple className="mr-2 size-4" /> Download for macOS (Intel-based
          Macs)
        </Button>
      </Link>

      {/* Windows x64 */}
      <Link href={links.windows_exe_x64} download>
        <Button size="lg" variant="outline">
          <Windows className="mr-2 size-4" /> Download for Windows (x64)
        </Button>
      </Link>

      {/* Windows Debian */}
      <Link href={links.linux_deb_x64} download>
        <Button size="lg" variant="outline">
          <Linux className="mr-2 size-4" /> Download for Linux (Debian / Ubuntu)
        </Button>
      </Link>

      {/* Windows Red Hat */}
      <Link href={links.linux_rpm_x64} download>
        <Button size="lg" variant="outline">
          <Linux className="mr-2 size-4" /> Download for Linux (Red Hat / Fedora
          / SUSE)
        </Button>
      </Link>
    </div>
  );
}

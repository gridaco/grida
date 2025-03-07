import React from "react";
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
      <main className="flex-grow flex items-center">
        <section className="container max-w-2xl mx-auto py-20 text-center border rounded-lg">
          <h1 className="text-6xl font-bold mb-6">
            Download Grida Desktop app
          </h1>
          <p className="text-base text-muted-foreground mb-12">
            Optimized for macOS. Download now and start creating effortlessly.
          </p>
          <div className="flex justify-center space-x-4">
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
          <div className="mt-2"></div>
        </section>
      </main>
      <div className="h-32" />
      <div className="container w-full items-center">
        <h1 className="text-center text-3xl font-semibold mb-6">
          Get Grida for Windows & more
        </h1>
        <p className="text-center text-base text-muted-foreground mb-12">
          A faster, more focused experience awaits.
        </p>
        <DownloadButtons links={links} />
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
        <Button size="lg">
          <Apple className="mr-2 size-4" /> Download for macOS (Universal)
        </Button>
      </Link>

      {/* macOS Apple Silicon */}
      <Link href={links.mac_dmg_arm64} download>
        <Button size="lg">
          <Apple className="mr-2 size-4" /> Download for macOS (Apple Silicon)
        </Button>
      </Link>

      {/* macOS Intel */}
      <Link href={links.mac_dmg_x64} download>
        <Button size="lg">
          <Apple className="mr-2 size-4" /> Download for macOS (Intel-based
          Macs)
        </Button>
      </Link>

      {/* Windows x64 */}
      <Link href={links.windows_exe_x64} download>
        <Button size="lg">
          <Windows className="mr-2 size-4" /> Download for Windows (x64)
        </Button>
      </Link>

      {/* Windows Debian */}
      <Link href={links.linux_deb_x64} download>
        <Button size="lg">
          <Linux className="mr-2 size-4" /> Download for Linux (Debian / Ubuntu)
        </Button>
      </Link>

      {/* Windows Red Hat */}
      <Link href={links.linux_rpm_x64} download>
        <Button size="lg">
          <Linux className="mr-2 size-4" /> Download for Linux (Red Hat / Fedora
          / SUSE)
        </Button>
      </Link>
    </div>
  );
}

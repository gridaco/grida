import React from "react";
import Footer from "@/www/footer";
import Header from "@/www/header";
import { Button } from "@/components/ui/button";
import { DownloadIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { sitemap } from "@/www/data/sitemap";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Downloads",
  description: "Download Grida",
};

export default function DownloadsPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow flex items-center">
        <section className="container max-w-2xl mx-auto py-20 text-center border rounded-lg">
          <h1 className="text-4xl font-bold mb-4">Download Grida Desktop</h1>
          <p className="text-base text-muted-foreground mb-8">
            Unleash your creativity.
          </p>
          <div className="flex justify-center space-x-4">
            <Link href={sitemap.links.releases_latest}>
              <Button size="lg">
                <DownloadIcon className="mr-2 h-4 w-4" /> Download for macOS
              </Button>
            </Link>
            {/* <Link href={sitemap.links.releases_latest}>
              <Button size="lg">
                <DownloadIcon className="mr-2 h-4 w-4" /> Download for Windows
              </Button>
            </Link> */}
            {/* <Link href={sitemap.links.releases_latest}>
              <Button size="lg" >
                <DownloadIcon className="mr-2 h-4 w-4" /> Download for Linux
              </Button>
            </Link> */}
          </div>
          <div className="mt-2">
            <span className="text-xs text-muted-foreground">
              Only supports macOS for now. Windows and Linux versions coming
              soon.
            </span>
          </div>
        </section>
      </main>
      <Footer />
    </main>
  );
}

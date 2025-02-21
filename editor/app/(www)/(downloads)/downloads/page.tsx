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
        <section className="container mx-auto py-20 text-center border rounded shadow">
          <h1 className="text-4xl font-bold mb-4">Download Grida</h1>
          <p className="text-base text-muted-foreground mb-8">
            Unleash your creativity with our powerful graphics design app
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
        </section>
      </main>
      <Footer />
    </main>
  );
}

import React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@app/ui/components/button";
import { sitemap } from "@/www/data/sitemap";
import { CopyButton } from "../_components/copy-button";
import { BundleArt } from "../_components/bundle-art";

const INSTALL = "npm i dotcanvas";

export default function Hero() {
  return (
    <div className="px-6 py-20 md:px-12 md:py-28">
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <h1 className="font-mono text-5xl font-semibold tracking-tight md:text-7xl">
            .canvas
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">
            A portable directory of standalone documents plus a single{" "}
            <code className="font-mono text-foreground">.canvas.json</code>{" "}
            manifest — order, 2D layout, and skip. A container format, not a
            scene format. Copy it, zip it, check it into git: no database, no
            absolute paths, no host coupling.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 py-1.5 pl-4 pr-2 font-mono text-sm">
              <span className="select-none text-muted-foreground/60">$</span>
              <span>{INSTALL}</span>
              <CopyButton value={INSTALL} className="ml-2" />
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={sitemap.links.npm_dotcanvas}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button className="gap-1.5">
                  View on npm
                  <ArrowUpRight className="size-4" />
                </Button>
              </Link>
              <Link
                href={sitemap.links.github_dotcanvas}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline">GitHub</Button>
              </Link>
            </div>
          </div>
        </div>

        <BundleArt className="w-full max-w-md justify-self-center text-foreground lg:justify-self-end" />
      </div>
    </div>
  );
}

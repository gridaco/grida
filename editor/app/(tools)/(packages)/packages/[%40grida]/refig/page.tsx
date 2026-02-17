import { NpmLogoIcon } from "@/components/logos/npm";
import { Button } from "@/components/ui/button";
import Header from "@/www/header";
import Footer from "@/www/footer";
import Link from "next/link";

export const metadata = {
  title: "@grida/refig — Headless Figma Renderer",
  description:
    "Render Figma documents to PNG, JPEG, WebP, PDF, or SVG in Node.js or browser. Deterministic exports, offline .fig support, CLI and library API.",
};

export default function RefigPage() {
  return (
    <main className="min-h-screen">
      <Header className="relative" />
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold font-mono mb-2">@grida/refig</h1>
            <p className="text-muted-foreground text-lg">
              Headless Figma renderer — render Figma documents to{" "}
              <strong>PNG, JPEG, WebP, PDF, or SVG</strong> in Node.js (no
              browser required) or directly in the browser.
            </p>
          </div>

          {/* CTA Links */}
          <div className="flex flex-wrap gap-3">
            <Link href="/docs/packages/@grida/refig">
              <Button>Read Docs</Button>
            </Link>
            <Link
              href="https://npmjs.com/package/@grida/refig"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline">
                <NpmLogoIcon className="size-6 mr-2" />
                npm
              </Button>
            </Link>
          </div>

          {/* Demo video (refig has no live demo) */}
          <section>
            <h2 className="text-lg font-semibold mb-3">Demo video</h2>
            <div
              className="rounded-lg overflow-hidden border bg-muted"
              style={{ paddingBottom: "56.25%", position: "relative" }}
            >
              <iframe
                src="https://player.vimeo.com/video/1165652748?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=0&muted=0&loop=0"
                className="absolute top-0 left-0 w-full h-full"
                frameBorder="0"
                allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                title="refig (headless figma renderer) demo"
              />
            </div>
          </section>

          {/* Key Features */}
          <section>
            <h2 className="text-lg font-semibold mb-3">Key Features</h2>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-muted-foreground">
              <li className="flex items-center">
                <span className="mr-2 text-primary">•</span>
                Node.js and browser entrypoints
              </li>
              <li className="flex items-center">
                <span className="mr-2 text-primary">•</span>
                CLI and library API
              </li>
              <li className="flex items-center">
                <span className="mr-2 text-primary">•</span>
                Offline rendering from .fig files
              </li>
              <li className="flex items-center">
                <span className="mr-2 text-primary">•</span>
                REST API JSON input
              </li>
              <li className="flex items-center">
                <span className="mr-2 text-primary">•</span>
                Deterministic, CI-friendly exports
              </li>
            </ul>
          </section>

          {/* Quick start */}
          <section>
            <h2 className="text-lg font-semibold mb-3">
              Quick start (Node.js)
            </h2>
            <pre className="bg-muted rounded-lg p-4 text-sm overflow-x-auto">
              <code>{`import { writeFileSync } from "node:fs";
import { FigmaDocument, FigmaRenderer } from "@grida/refig";

const doc = FigmaDocument.fromFile("./design.fig");
const renderer = new FigmaRenderer(doc);

const { data } = await renderer.render("1:23", { format: "png", scale: 2 });
writeFileSync("out.png", data);
renderer.dispose();`}</code>
            </pre>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">Quick start (CLI)</h2>
            <pre className="bg-muted rounded-lg p-4 text-sm overflow-x-auto">
              <code>{`# Render a single node
npx @grida/refig ./design.fig --node "1:23" --out ./out.png

# Export everything with Figma export presets
npx @grida/refig ./design.fig --export-all --out ./exports`}</code>
            </pre>
          </section>

          <p className="text-muted-foreground text-sm">
            For full documentation, API reference, and demo video, see{" "}
            <Link
              href="/docs/packages/@grida/refig"
              className="text-primary underline underline-offset-2"
            >
              the refig docs
            </Link>
            .
          </p>
        </div>
      </div>
      <Footer />
    </main>
  );
}

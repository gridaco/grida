"use client";

import {
  FigmaThemePanel,
  FinderThemePanel,
  GridaThemePanel,
  VSCodeThemePanel,
} from "@/app/(dev)/ui/components/tree-view/_themes";
import { NpmLogoIcon } from "@/components/logos/npm";
import { Button } from "@/components/ui/button";
import { CopyToClipboardInput } from "@/components/copy-to-clipboard-input";
import { BentoGrid } from "@/www/ui/bento-grid";
import Footer from "@/www/footer";
import Header from "@/www/header";
import {
  ArrowRightIcon,
  AtomIcon,
  BookOpenIcon,
  DatabaseIcon,
  GithubIcon,
  KeyboardIcon,
  ListOrderedIcon,
  MoveIcon,
  PackageIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react";
import Link from "next/link";

const NPM_URL = "https://www.npmjs.com/package/@grida/tree-view";
const GITHUB_URL =
  "https://github.com/gridaco/grida/tree/main/packages/grida-tree-view";
const DOCS_PATH = "/ui/components/tree-view";

export default function TreeViewLandingPage() {
  return (
    <main className="min-h-screen">
      <Header className="relative" />

      {/* Hero */}
      <section className="container mx-auto px-4 pt-32 pb-12">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-600">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Zero runtime dependencies · ESM + CJS · MIT
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight font-mono">
            @grida/tree-view
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Headless, agnostic tree-view controller for editors and IDEs. No DOM
            imports in the core, no widget library on top — just a state machine
            plus a small set of pure helpers, and you render the rows with
            whatever framework and stylesheet you want.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href={DOCS_PATH}>
              <Button size="lg">
                <BookOpenIcon className="size-4 mr-2" />
                Documentation
                <ArrowRightIcon className="size-4 ml-2" />
              </Button>
            </Link>
            <Link href={NPM_URL} target="_blank">
              <Button size="lg" variant="outline">
                <NpmLogoIcon className="size-8 mr-1" />
                npm
              </Button>
            </Link>
            <Link href={GITHUB_URL} target="_blank">
              <Button size="lg" variant="outline">
                <GithubIcon className="size-4 mr-2" />
                GitHub
              </Button>
            </Link>
          </div>
          <div className="pt-2 max-w-sm mx-auto">
            <CopyToClipboardInput value="pnpm add @grida/tree-view" />
          </div>
        </div>
      </section>

      {/* Themed bento showcase */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-6xl mx-auto mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3 max-w-xl">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">
              <span className="size-1.5 rounded-full bg-zinc-900" />
              One controller, many trees
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Same wiring. Wildly different trees.
            </h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
            Each panel below is <strong>identical</strong>{" "}
            <code className="text-[13px] bg-zinc-100 px-1.5 py-0.5 rounded">
              TreeController
            </code>{" "}
            wiring — different fixture, row renderer, indent geometry,
            constraint stack. Drag rows, expand chevrons, click to select — it
            all works.
          </p>
        </div>

        <BentoGrid className="max-w-6xl mx-auto grid-cols-1 md:grid-cols-2 auto-rows-fr">
          <ShowcaseCard
            name="Grida"
            tagline="Monochrome zinc accent. Eye + lock per row, full reorder drag."
            accent="bg-zinc-900"
          >
            <GridaThemePanel />
          </ShowcaseCard>
          <ShowcaseCard
            name="Figma"
            tagline="Dark layers panel. Components in purple, hidden layers dim, full reorder drag."
            accent="bg-purple-500"
          >
            <FigmaThemePanel />
          </ShowcaseCard>
          <ShowcaseCard
            name="VS Code"
            tagline="Filesystem semantics — drop is always into the nearest folder. Target highlights in blue. No reordering."
            accent="bg-sky-500"
          >
            <VSCodeThemePanel />
          </ShowcaseCard>
          <ShowcaseCard
            name="Finder"
            tagline="Multi-column grid, zebra rows, double-click to expand. Same FS drag rule as VS Code."
            accent="bg-emerald-500"
          >
            <FinderThemePanel />
          </ShowcaseCard>
        </BentoGrid>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-16 border-t border-zinc-200">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-2xl mb-10 space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">
              Built for editor scale.
            </h2>
            <p className="text-muted-foreground">
              The state machine, the math, the intents — packaged so adopters
              ship a tree in a day, not a quarter.
            </p>
          </div>
          <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="space-y-2">
                <div className="inline-flex size-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700">
                  <f.Icon className="size-4" strokeWidth={1.75} />
                </div>
                <h3 className="text-sm font-semibold">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-16 border-t border-zinc-200">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-2xl font-bold tracking-tight">
            See every pattern.
          </h2>
          <p className="text-muted-foreground">
            The documentation page walks through 18 panels — themed showcases,
            virtualization at 10,000 rows, inline rename, type-ahead, grouping
            highlights, and more.
          </p>
          <Link href={DOCS_PATH}>
            <Button size="lg">
              Open documentation
              <ArrowRightIcon className="size-4 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Bento-style card adapted from www/ui/bento-grid for interactive content.
// The themed panel is part of normal flow (clickable, draggable) instead of
// the original "background" slot, since adopters need to feel the interaction.
// ───────────────────────────────────────────────────────────────────────────

function ShowcaseCard({
  name,
  tagline,
  accent,
  children,
}: {
  name: string;
  tagline: string;
  accent: string;
  children: React.ReactNode;
}) {
  // The descendant selectors stretch the themed panel's chrome (the
  // outer two divs and the `[role="tree"]` element) to fill the card's
  // remaining height, overriding the panels' fixed `h-80` so all four
  // cards end at the same bottom padding regardless of header chrome.
  return (
    <div className="group relative col-span-1 flex h-full flex-col gap-3 rounded-xl bg-background p-3 [box-shadow:0_0_0_1px_rgba(0,0,0,.03),0_2px_4px_rgba(0,0,0,.05),0_12px_24px_rgba(0,0,0,.05)] dark:bg-background dark:[border:1px_solid_rgba(255,255,255,.05)] dark:[box-shadow:0_-20px_80px_-20px_#ffffff1f_inset]">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${accent}`} aria-hidden />
            <h3 className="text-base font-semibold">{name}</h3>
          </div>
          <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
            {tagline}
          </p>
        </div>
      </div>
      <div
        className="
          flex flex-1 min-h-0 justify-center
          [&>div]:w-full [&>div]:flex [&>div]:flex-col
          [&>div>div]:flex [&>div>div]:flex-col [&>div>div]:flex-1 [&>div>div]:min-h-0
          [&_[role=tree]]:!h-auto [&_[role=tree]]:flex-1 [&_[role=tree]]:min-h-0
        "
      >
        {children}
      </div>
    </div>
  );
}

const features: {
  title: string;
  body: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}[] = [
  {
    Icon: PackageIcon,
    title: "Zero runtime dependencies",
    body: "~500 LOC of business logic, ESM + CJS, full TypeScript types. Nothing else gets pulled in.",
  },
  {
    Icon: DatabaseIcon,
    title: "You own your data",
    body: "TreeSource is read-only — wrap your editor state; the package never mutates your store.",
  },
  {
    Icon: MoveIcon,
    title: "Headless drag & drop",
    body: "Pure state machine plus geometry helpers. Compose move constraints, fire move / copy intents, plug into any pointer or touch backend.",
  },
  {
    Icon: ZapIcon,
    title: "Six subscription channels",
    body: "rows · expanded · focus · drag · selection · intent — fine-grained so a row only re-renders for its own slice.",
  },
  {
    Icon: KeyboardIcon,
    title: "Keyboard, with type-ahead",
    body: "Configurable keymap dispatch, default keymap shipped (never auto-wired), platform-consistent modifier composition.",
  },
  {
    Icon: ListOrderedIcon,
    title: "Virtualization-ready",
    body: "controller.getRows() is a stable flat list — plug straight into @tanstack/react-virtual or any windowing library.",
  },
  {
    Icon: SparklesIcon,
    title: "Production-grown",
    body: "Driven by the same controller as the Grida editor's layers panel. The demo gallery reproduces Figma, VS Code, and Finder from one core.",
  },
  {
    Icon: AtomIcon,
    title: "Optional React peer",
    body: "Core runs unchanged in Node, Bun, Deno, browser, web worker. React bindings are an opt-in /react subpath.",
  },
];

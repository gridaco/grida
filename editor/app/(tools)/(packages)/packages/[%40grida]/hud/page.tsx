"use client";

import {
  ArchitectureSection,
  AspectRatioSection,
  ClickTrackerSection,
  CornerRadiusSection,
  CursorsSection,
  GroupSelectionSection,
  LayoutSection,
  LineSection,
  MeasurementSection,
  NotYetBuiltSection,
  PaddingOverlaySection,
  TransformBoxImageFitSection,
  ParametricHandlesSection,
  PerformanceSection,
  PixelGridSection,
  PrimitivesSection,
  RulerGuidesSection,
  SelectionScenariosSection,
  SizeMeterSection,
  SnapSection,
  TransformedSection,
  VectorChromeSection,
  VisibilitySection,
} from "@/app/(dev)/ui/components/hud/_showcase";
import { LiveEditorSection } from "@/app/(dev)/ui/components/hud/_live-section";
import { CopyToClipboardInput } from "@/components/copy-to-clipboard-input";
import { cn } from "@app/ui/lib/utils";
import { NpmLogoIcon } from "@/components/logos/npm";
import { Button } from "@app/ui/components/button";
import { useScrollSpy } from "@/hooks/use-scroll-spy";
import Footer from "@/www/footer";
import Header from "@/www/header";
import { ArrowRightIcon, GithubIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

const NPM_URL = "https://www.npmjs.com/package/@grida/hud";
const GITHUB_URL =
  "https://github.com/gridaco/grida/tree/main/packages/grida-canvas-hud";
const README_URL =
  "https://github.com/gridaco/grida/blob/main/packages/grida-canvas-hud/README.md";
const WG_SELECTION_INTENT =
  "https://grida.co/docs/wg/feat-editor/ux-surface/selection-intent";
const WG_SELECTION =
  "https://grida.co/docs/wg/feat-editor/ux-surface/selection";

// In-page table of contents — keep section ids in sync with _showcase.tsx
// + _live-section.tsx.
const SECTIONS: { id: string; label: string }[] = [
  { id: "live", label: "Live editor" },
  { id: "primitives", label: "Primitives" },
  { id: "architecture", label: "Architecture" },
  { id: "selection-scenarios", label: "Selection intent" },
  { id: "group-selection", label: "Group selection" },
  { id: "transformed", label: "Transformed" },
  { id: "line", label: "Line selection" },
  { id: "layout", label: "Layout / 9-slice" },
  { id: "size-meter", label: "Size meter" },
  { id: "corner-radius", label: "Corner radius" },
  { id: "padding-overlay", label: "Padding overlay" },
  { id: "transform-box", label: "Transform box" },
  { id: "aspect-ratio", label: "Aspect ratio" },
  { id: "parametric-handles", label: "Parametric handles" },
  { id: "vector", label: "Vector chrome" },
  { id: "snap", label: "Snap" },
  { id: "measurement", label: "Measurement" },
  { id: "ruler-guides", label: "Ruler & guides" },
  { id: "pixel-grid", label: "Pixel grid" },
  { id: "cursors", label: "Cursors" },
  { id: "click-tracker", label: "Click tracker" },
  { id: "visibility", label: "Visibility groups" },
  { id: "performance", label: "Performance" },
  { id: "not-yet-built", label: "Not yet built" },
];

function SidebarToc({
  sections,
}: {
  sections: { id: string; label: string }[];
}) {
  // Memoize the id array so the hook's effect doesn't refire on every render
  // — `useScrollSpy` depends on referential stability of the input list.
  const ids = useMemo(() => sections.map((s) => s.id), [sections]);
  const active = useScrollSpy(ids);

  return (
    <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-auto pb-8">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        On this page
      </div>
      <ul className="border-l border-zinc-200 text-sm">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={cn(
                "-ml-px block border-l py-1 pl-3 transition-colors hover:border-indigo-300 hover:text-indigo-600",
                active === s.id
                  ? "border-indigo-500 font-medium text-indigo-600"
                  : "border-transparent text-zinc-600"
              )}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function HudSpecPage() {
  return (
    <main className="min-h-screen">
      <Header className="relative" />

      {/* Hero + spec sections share one layout grid. On xl+ the right column
          is the sticky on-this-page nav; below xl the layout collapses and
          the inline TOC card in the hero handles navigation. */}
      <div className="mx-auto max-w-7xl xl:flex xl:gap-24 xl:px-4">
        <div className="min-w-0 xl:flex-1">
          {/* Hero — left aligned to the grid, mirrors Section's inner padding */}
          <section className="pt-20 pb-10">
            <div className="mx-auto max-w-6xl px-4">
              <div className="max-w-5xl space-y-6">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Technical spec · v0.x · MIT
                  </div>
                  <h1 className="font-mono text-3xl font-bold tracking-tight md:text-4xl">
                    @grida/hud
                  </h1>
                  <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
                    Surface backend for the Grida editor viewport. This page
                    walks through every contract the package implements, with a
                    minimal live demo per section. Where a rule traces back to a
                    working-group decision, the row cites the wg doc. Skim the
                    sections, click around, hover the inspector.
                  </p>
                </div>

                {/* Quick links */}
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={README_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button size="sm" variant="outline">
                      README
                      <ArrowRightIcon className="ml-1.5 size-3.5" />
                    </Button>
                  </Link>
                  <Link
                    href={WG_SELECTION_INTENT}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button size="sm" variant="outline">
                      wg: selection-intent
                    </Button>
                  </Link>
                  <Link
                    href={WG_SELECTION}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button size="sm" variant="outline">
                      wg: selection
                    </Button>
                  </Link>
                  <Link
                    href={NPM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button size="sm" variant="outline">
                      <NpmLogoIcon className="mr-1 size-6" />
                      npm
                    </Button>
                  </Link>
                  <Link
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button size="sm" variant="outline">
                      <GithubIcon className="mr-1.5 size-3.5" />
                      source
                    </Button>
                  </Link>
                </div>

                {/* Install — its own row so it doesn't compete with the
                    button cluster on narrow viewports */}
                <div className="w-full max-w-sm">
                  <CopyToClipboardInput value="pnpm add @grida/hud" />
                </div>

                {/* Table of contents — inline on small screens; floats on xl+ */}
                <nav className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 xl:hidden">
                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Contents
                  </div>
                  <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3 lg:grid-cols-4">
                    {SECTIONS.map((s) => (
                      <li key={s.id}>
                        <a
                          href={`#${s.id}`}
                          className="block py-0.5 text-zinc-700 hover:text-indigo-600"
                        >
                          {s.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            </div>
          </section>

          <LiveEditorSection />
          <PrimitivesSection />
          <ArchitectureSection />
          <SelectionScenariosSection />
          <GroupSelectionSection />
          <TransformedSection />
          <LineSection />
          <LayoutSection />
          <SizeMeterSection />
          <CornerRadiusSection />
          <PaddingOverlaySection />
          <TransformBoxImageFitSection />
          <AspectRatioSection />
          <ParametricHandlesSection />
          <VectorChromeSection />
          <SnapSection />
          <MeasurementSection />
          <RulerGuidesSection />
          <PixelGridSection />
          <CursorsSection />
          <ClickTrackerSection />
          <VisibilitySection />
          <PerformanceSection />
          <NotYetBuiltSection />
        </div>
        <aside
          aria-label="On this page"
          className="hidden w-56 shrink-0 pt-16 xl:block"
        >
          <SidebarToc sections={SECTIONS} />
        </aside>
      </div>

      <Footer />
    </main>
  );
}

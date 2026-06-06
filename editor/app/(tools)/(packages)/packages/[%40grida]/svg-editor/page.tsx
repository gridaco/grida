"use client";

import {
  CssExample,
  GroupTransformExample,
  LineExample,
  NestedSvgExample,
  PathExample,
  ShapesExample,
  SymbolUseExample,
  TextExample,
} from "./_examples";
import { FeaturedDemo } from "./_featured";
import { NpmLogoIcon } from "@/components/logos/npm";
import { Button } from "@app/ui/components/button";
import { CopyToClipboardInput } from "@/components/copy-to-clipboard-input";
import { cn } from "@app/ui/lib/utils";
import { useScrollSpy } from "@/hooks/use-scroll-spy";
import Footer from "@/www/footer";
import Header from "@/www/header";
import { ArrowRightIcon, GithubIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import type * as React from "react";

const NPM_URL = "https://www.npmjs.com/package/@grida/svg-editor";
const GITHUB_URL =
  "https://github.com/gridaco/grida/tree/main/packages/grida-svg-editor";

// Related demos — the full-editor seams and the sibling package page.
const RELATED: { href: string; label: string }[] = [
  { href: "/svg/examples/default", label: "Full editor" },
  { href: "/svg/examples/slides", label: "Slides example" },
  { href: "/packages/@grida/hud", label: "@grida/hud" },
];

// On-this-page nav — keep ids in sync with the section/card ids below.
const SECTIONS: { id: string; label: string }[] = [
  { id: "featured", label: "Featured demo" },
  { id: "shapes", label: "Shapes" },
  { id: "path", label: "Path" },
  { id: "line", label: "Line" },
  { id: "text", label: "Text & tspan" },
  { id: "groups", label: "Groups & transform" },
  { id: "nested-svg", label: "Nested <svg>" },
  { id: "symbol-use", label: "Symbol & use" },
  { id: "css", label: "CSS cascade" },
];

export default function SvgEditorPackagePage() {
  return (
    <main className="min-h-screen">
      <Header className="relative" />

      {/* Hero + sections share one layout grid. On xl+ the right column is the
          sticky on-this-page nav; below xl the layout collapses and the inline
          TOC card in the hero handles navigation. (Same shape as @grida/hud.) */}
      <div className="mx-auto max-w-7xl xl:flex xl:gap-24 xl:px-4">
        <div className="min-w-0 xl:flex-1">
          {/* Hero — left-aligned within the grid column, mirroring @grida/hud */}
          <section className="px-4 pt-32 pb-10">
            <div className="max-w-5xl space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-600">
                <span className="size-1.5 rounded-full bg-amber-500" />
                Experimental · alpha · MIT
              </div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight font-mono">
                @grida/svg-editor
              </h1>
              <p className="max-w-3xl text-lg text-muted-foreground leading-relaxed">
                A <strong>clean</strong> SVG editor — open a file, edit it, save
                it, and the diff is exactly the change you made. The demo below
                is the whole editor; the cards under it isolate one feature
                each. For the editor wired into a full product, see the{" "}
                <Link
                  href="/svg/examples/default"
                  className="underline underline-offset-4"
                >
                  editor seam demo
                </Link>
                .
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link href={NPM_URL} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" variant="outline">
                    <NpmLogoIcon className="size-8 mr-1" />
                    npm
                  </Button>
                </Link>
                <Link
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="lg" variant="outline">
                    <GithubIcon className="size-4 mr-2" />
                    GitHub
                  </Button>
                </Link>
              </div>
              <div className="w-full max-w-sm">
                <CopyToClipboardInput value="npm install @grida/svg-editor" />
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                {RELATED.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {label}
                    <ArrowRightIcon className="size-3" />
                  </Link>
                ))}
              </div>

              {/* Inline TOC — small screens only; the sticky aside takes over on xl+ */}
              <nav className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 xl:hidden">
                <div className="mb-3 text-[11px] font-semibold tracking-wider text-zinc-500">
                  On this page
                </div>
                <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
                  {SECTIONS.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className="block py-0.5 text-zinc-700 hover:text-foreground"
                      >
                        {s.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </section>

          {/* Featured demo — the whole editor, end-to-end. */}
          <section id="featured" className="px-4 pb-6 scroll-mt-24">
            <div className="max-w-5xl mx-auto">
              <FeaturedDemo />
            </div>
          </section>

          {/* Harness note — this page is also design feedback to the package. */}
          <section className="px-4 py-6">
            <div className="max-w-5xl mx-auto rounded-lg border border-amber-200 bg-amber-50/60 px-5 py-4 text-sm text-amber-900">
              <p className="font-medium">
                This page is a harness, not just a gallery.
              </p>
              <p className="mt-1 leading-relaxed text-amber-800">
                Each fixture below is paired with the interaction it is meant to
                exercise — line endpoints, path vertices, text runs, group
                scope, the CSS cascade. But the editor cannot yet be{" "}
                <em>locked</em> to that interaction: there is no capability
                profile, so every tool and command stays live in every card. The
                fixtures are written now so that fixture + behavior-constraint
                line up once that profile lands. See the directory{" "}
                <code className="rounded bg-amber-100 px-1 py-0.5">
                  README.md
                </code>{" "}
                for the proposal and roadmap.
              </p>
            </div>
          </section>

          {/* Spec cards — one fixture each. */}
          <section className="px-4 py-8">
            <div className="max-w-5xl mx-auto space-y-12">
              <div className="max-w-3xl space-y-1">
                <h2 className="text-3xl font-bold tracking-tight">Fixtures</h2>
                <p className="text-sm text-muted-foreground">
                  Each card mounts an isolated editor on a fixture that targets
                  one interaction surface. Click an element to see its chrome;
                  the relevant element is pre-selected where it helps.
                </p>
              </div>

              <SpecCard
                id="shapes"
                title="Shapes — every primitive"
                description={
                  <>
                    <code>rect</code>, rounded <code>rect</code>,{" "}
                    <code>circle</code>, <code>ellipse</code>, <code>line</code>
                    , <code>polyline</code>, <code>polygon</code>,{" "}
                    <code>path</code> — one of each. Every shape is its own
                    Policy Class with distinct resize semantics.
                  </>
                }
                caption="A future 'shapes only' profile would gate which primitives the insert tools can author and select."
              >
                <ShapesExample />
              </SpecCard>

              <SpecCard
                id="path"
                title="Path — vector content edit"
                description={
                  <>
                    A single path (cubic + smooth-cubic segments), pre-selected.
                    Press <kbd>Enter</kbd> or the lasso (<kbd>Q</kbd>) to drop
                    into content-edit and reveal the vertex / tangent chrome.
                  </>
                }
                caption="A 'path editing' profile would lock to content-edit on this node and suppress select-mode transforms."
              >
                <PathExample />
              </SpecCard>

              <SpecCard
                id="line"
                title="Line — the 2-point exception"
                description={
                  <>
                    <code>&lt;line&gt;</code> has no bbox resize — it has
                    exactly two endpoints. The pre-selected diagonal shows
                    endpoint handles, not eight corner/edge handles.
                  </>
                }
                caption="A 'line only' profile would constrain interaction to the two endpoints — the canonical fixture + constraint pairing."
              >
                <LineExample />
              </SpecCard>

              <SpecCard
                id="text"
                title="Text & tspan"
                description={
                  <>
                    One <code>&lt;text&gt;</code> with multiple{" "}
                    <code>&lt;tspan&gt;</code> runs and a second baseline via{" "}
                    <code>dy</code>. Double-click to edit inline. Inline edit is
                    single-flat-run today; tspan / multi-line is the open
                    behavior this fixture probes.
                  </>
                }
                caption="A 'text only' embed is exactly the kind of locked profile this harness wants and the package can't yet express."
              >
                <TextExample />
              </SpecCard>

              <SpecCard
                id="groups"
                title="Groups & transform"
                description={
                  <>
                    A rotated <code>&lt;g&gt;</code> nesting a translated one.
                    The pre-selected group shows a rotation-aware bbox;{" "}
                    <kbd>Enter</kbd> descends scope into the children.
                  </>
                }
                caption="Profiles intersect with structure here: 'no structural edits' would keep selection + transform but disable group / ungroup / reorder."
              >
                <GroupTransformExample />
              </SpecCard>

              <SpecCard
                id="nested-svg"
                title="Nested <svg> — a viewport within a viewport"
                description={
                  <>
                    An inner <code>&lt;svg&gt;</code> with its own{" "}
                    <code>x</code>/<code>y</code> origin and its own{" "}
                    <code>viewBox</code> establishes an independent user-space
                    coordinate system (SVG 2 §7.2). The editor parses,
                    preserves, and renders it; a node <em>inside</em> the inner
                    viewport is pre-selected.
                  </>
                }
                caption="Translating a node inside an inner viewport now projects the delta into that viewport's frame, so it moves correctly. Still open: getCTM stops at the nearest viewport, so HUD chrome for a node spanning the inner-viewport boundary is unresolved. See packages/grida-svg-editor/docs/geometry.md and the nested-svg notes in src/dom.ts."
              >
                <NestedSvgExample />
              </SpecCard>

              <SpecCard
                id="symbol-use"
                title="Symbol & use — one source, many instances"
                description={
                  <>
                    A <code>&lt;symbol&gt;</code> defines the geometry once;
                    each <code>&lt;use&gt;</code> instantiates it. The{" "}
                    <code>color</code> on each instance flows into{" "}
                    <code>currentColor</code> inside the symbol, so the shared
                    pin recolors per instance. The big one is pre-selected — its
                    chrome is the instance box, not the symbol.
                  </>
                }
                caption="Editing a <use> is its own Policy Class: move / scale the instance vs. edit the shared symbol. How the editor surfaces that split — and per-instance paint overrides — is the open question. editor.defs.symbols is the registry."
              >
                <SymbolUseExample />
              </SpecCard>

              <SpecCard
                id="css"
                title="CSS — cascade beyond color"
                description={
                  <>
                    A document <code>&lt;style&gt;</code> block drives{" "}
                    <em>fill</em> and <em>geometry</em> (rotate, translate) —
                    not just paint. Selection chrome reads world geometry, so
                    CSS transforms are the open question this harness exists to
                    settle.
                  </>
                }
                caption="Not yet decided: how the editor cooperates with the cascade. This card is the surface for choosing the behavior, not a finished feature."
              >
                <CssExample />
              </SpecCard>
            </div>
          </section>
        </div>

        <aside
          aria-label="On this page"
          className="hidden w-56 shrink-0 pt-32 xl:block"
        >
          <SidebarToc sections={SECTIONS} />
        </aside>
      </div>

      <Footer />
    </main>
  );
}

function SidebarToc({
  sections,
}: {
  sections: { id: string; label: string }[];
}) {
  // Memoize the id array so the hook's effect doesn't refire on every render —
  // useScrollSpy depends on referential stability of the input list.
  const ids = useMemo(() => sections.map((s) => s.id), [sections]);
  const active = useScrollSpy(ids);

  return (
    <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-auto pb-8">
      <div className="mb-3 text-[11px] font-semibold tracking-wider text-zinc-500">
        On this page
      </div>
      <ul className="border-l border-zinc-200 text-sm">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={cn(
                "-ml-px block border-l py-1 pl-3 transition-colors hover:border-zinc-400 hover:text-foreground",
                active === s.id
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground"
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

function SpecCard({
  id,
  title,
  description,
  caption,
  children,
}: {
  id?: string;
  title: React.ReactNode;
  description: React.ReactNode;
  caption?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <div>
        <h3 className="text-xl font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-2xl">{description}</p>
      </div>
      {children}
      {caption && (
        <p className="text-xs text-muted-foreground/80 max-w-2xl">
          <span className="font-medium text-amber-600">Harness note — </span>
          {caption}
        </p>
      )}
    </section>
  );
}

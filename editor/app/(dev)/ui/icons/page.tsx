import type { Metadata } from "next";
import React from "react";

// The whole package surface, enumerated as namespaces so this page can never
// drift from what the package actually ships — a new export renders here
// without touching this file.
import * as icons from "@grida/react-icons";
import * as logos from "@grida/react-icons/logos";

// Not yet promoted — still editor-internal (couples @grida/cg + flex composites).
import {
  StrokeDecorationNoneIcon,
  StrokeDecorationArrowLinesIcon,
  StrokeDecorationTriangleFilledIcon,
  StrokeDecorationCircleFilledIcon,
  StrokeDecorationSquareFilledIcon,
  StrokeDecorationDiamondFilledIcon,
  StrokeDecorationVerticalBarFilledIcon,
} from "@/scaffolds/sidecontrol/controls/icons/stroke-decoration-icons";

export const metadata: Metadata = {
  title: "Icons | Grida UI",
  description:
    "The @grida/react-icons surface, gridded by semantic group — plus the editor-internal glyphs still awaiting promotion.",
};

/**
 * An importable icon component that accepts an optional className for sizing.
 * (Components requiring extra props — e.g. the stroke-decoration composites'
 * `value` — are omitted; see the notes section.)
 */
type IconEntry = {
  name: string;
  /** Editor source path. Omitted once the icon is promoted to @grida/react-icons. */
  source?: string;
  Comp: React.ComponentType<{ className?: string }>;
};

type IconNamespace = Record<string, IconEntry["Comp"]>;

const ICONS_NS = icons as unknown as IconNamespace;
const LOGOS_NS = logos as unknown as IconNamespace;

// `default` guards against CJS-interop namespace quirks.
const exportedNames = (ns: IconNamespace) =>
  Object.keys(ns)
    .filter((n) => n !== "default")
    .sort();

const entriesOf = (ns: IconNamespace, names: readonly string[]): IconEntry[] =>
  names.map((name) => ({ name, Comp: ns[name] }));

// ── Promoted to @grida/react-icons/logos — enumerated from the package, so a
//    newly added logo shows up here automatically ─────────────────────────────

const BRAND: IconEntry[] = entriesOf(LOGOS_NS, ["GridaLogo"]);

const LOGOS: IconEntry[] = entriesOf(
  LOGOS_NS,
  exportedNames(LOGOS_NS).filter((n) => n !== "GridaLogo")
);

// ── Promoted to @grida/react-icons root — grouped by SEMANTIC role, not by the
//    editor directory the source happened to live in. Group membership is
//    typechecked against the package; anything not grouped falls through to
//    the automatic "Ungrouped" section below ──────────────────────────────────

const group = (names: readonly (keyof typeof icons)[]): IconEntry[] =>
  entriesOf(ICONS_NS, names);

const MEDIA = group(["PlayFilledIcon", "PauseFilledRoundedIcon"]);

const FILTER_FX = group([
  "FeNoiseIcon",
  "FeBackdropBlurIcon",
  "FeLayerBlurIcon",
  "FeGlassIcon",
]);

const PAINT = group([
  "SolidPaintIcon",
  "LinearGradientPaintIcon",
  "RadialGradientPaintIcon",
  "SweepGradientPaintIcon",
  "DiamondGradientPaintIcon",
  "ImagePaintIcon",
]);

const BLEND = group(["BlendModeIcon"]);

const IMAGE = group(["RemoveBackgroundIcon", "UpscaleIcon"]);

const VECTOR = group([
  "MirroringAllIcon",
  "MirroringAngleIcon",
  "MirroringNoneIcon",
]);

// Root exports not placed in a semantic group above — rendered automatically
// so nothing the package ships is missing from this page.
const GROUPED = new Set(
  [MEDIA, FILTER_FX, PAINT, BLEND, IMAGE, VECTOR].flat().map((e) => e.name)
);
const UNGROUPED: IconEntry[] = entriesOf(
  ICONS_NS,
  exportedNames(ICONS_NS).filter((n) => !GROUPED.has(n))
);

// ── Not yet promoted — editor-internal ───────────────────────────────────────

const STROKE_SRC =
  "scaffolds/sidecontrol/controls/icons/stroke-decoration-icons.tsx";
const STROKE_DECORATION: IconEntry[] = [
  {
    name: "StrokeDecorationNoneIcon",
    source: STROKE_SRC,
    Comp: StrokeDecorationNoneIcon,
  },
  {
    name: "StrokeDecorationArrowLinesIcon",
    source: STROKE_SRC,
    Comp: StrokeDecorationArrowLinesIcon,
  },
  {
    name: "StrokeDecorationTriangleFilledIcon",
    source: STROKE_SRC,
    Comp: StrokeDecorationTriangleFilledIcon,
  },
  {
    name: "StrokeDecorationCircleFilledIcon",
    source: STROKE_SRC,
    Comp: StrokeDecorationCircleFilledIcon,
  },
  {
    name: "StrokeDecorationSquareFilledIcon",
    source: STROKE_SRC,
    Comp: StrokeDecorationSquareFilledIcon,
  },
  {
    name: "StrokeDecorationDiamondFilledIcon",
    source: STROKE_SRC,
    Comp: StrokeDecorationDiamondFilledIcon,
  },
  {
    name: "StrokeDecorationVerticalBarFilledIcon",
    source: STROKE_SRC,
    Comp: StrokeDecorationVerticalBarFilledIcon,
  },
];

const PROMOTED_COUNT =
  exportedNames(ICONS_NS).length + exportedNames(LOGOS_NS).length;

function IconCell({
  name,
  source,
  tone = "muted",
  children,
}: {
  name: string;
  source?: string;
  tone?: "foreground" | "muted";
  children: React.ReactNode;
}) {
  return (
    <figure className="flex flex-col items-center gap-2 rounded-md border p-3 text-center">
      <div
        className={`flex h-16 w-full items-center justify-center ${
          tone === "foreground" ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {children}
      </div>
      <figcaption className="w-full">
        <p className="truncate font-mono text-xs" title={name}>
          {name}
        </p>
        {source ? (
          <p
            className="truncate text-[10px] text-muted-foreground"
            title={source}
          >
            {source}
          </p>
        ) : null}
      </figcaption>
    </figure>
  );
}

function IconGrid({
  entries,
  tone = "muted",
}: {
  entries: IconEntry[];
  tone?: "foreground" | "muted";
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {entries.map(({ name, source, Comp }) => (
        <IconCell
          key={`${source ?? "pkg"}#${name}`}
          name={name}
          source={source}
          tone={tone}
        >
          <Comp className="size-8" />
        </IconCell>
      ))}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default function UIIconsPage() {
  return (
    <main className="container mx-auto max-w-screen-lg space-y-10 py-10">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Foundations
        </p>
        <h1 className="mt-2 text-3xl font-bold">Icons</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          The <code className="font-mono">@grida/react-icons</code> surface,
          gridded by semantic group. {PROMOTED_COUNT} components are now
          imported from the package (the root for core glyphs,{" "}
          <code className="font-mono">/logos</code> for brand marks); the
          stroke-decoration set below is the remaining editor-internal holdout.
        </p>
      </div>

      <div className="rounded-md border p-4 text-sm">
        <p className="font-medium">
          Are you looking for{" "}
          <a
            href="https://icons.grida.co"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            icons.grida.co
          </a>
          ?
        </p>
        <p className="mt-1 leading-relaxed text-muted-foreground">
          Grida Icons is our aggregated catalog of popular open-source icon sets
          (Lucide, Heroicons, Phosphor, Octicons, Radix UI, SVGL) with a free
          search API — that&apos;s a separate project. This page documents{" "}
          <code className="font-mono">@grida/react-icons</code>: the
          hand-authored React components for Grida&apos;s own editor-domain
          glyphs and brand logos.
        </p>
      </div>

      <hr />

      <Section
        title="Brand"
        description="The Grida mark. Promoted to @grida/react-icons/logos — theme-free (currentColor); the editor's grida-logo.tsx adapter re-applies fill-foreground."
      >
        <IconGrid entries={BRAND} tone="foreground" />
      </Section>

      <hr />

      <Section
        title="Logos"
        description='Brand / company logos. Promoted to @grida/react-icons/logos — import via the explicit subpath: import { AppleLogo } from "@grida/react-icons/logos".'
      >
        <IconGrid entries={LOGOS} tone="foreground" />
      </Section>

      <hr />

      <Section
        title="Media"
        description="Player transport glyphs. Promoted to @grida/react-icons (root)."
      >
        <IconGrid entries={MEDIA} />
      </Section>

      <hr />

      <Section
        title="Filter effects"
        description="Layer / backdrop effect glyphs (fe-*). Promoted to @grida/react-icons (root)."
      >
        <IconGrid entries={FILTER_FX} />
      </Section>

      <hr />

      <Section
        title="Paint"
        description="Paint & gradient-type swatches — shape only (currentColor; the editor wraps them to add the border, theme, and active state). Sweep approximates the SVG-less conic with a 24-wedge stepped pie. Shown here in the muted tone (the package ships them as agnostic currentColor shapes)."
      >
        <IconGrid entries={PAINT} />
      </Section>

      <hr />

      <Section
        title="Blend"
        description="Compositing / blend-mode glyph — shape only (the outline; the editor's active-fill highlight is a host wrapper). Promoted to @grida/react-icons (root)."
      >
        <IconGrid entries={BLEND} />
      </Section>

      <hr />

      <Section
        title="Image"
        description="AI image-operation glyphs (remove background, upscale). Promoted to @grida/react-icons (root)."
      >
        <IconGrid entries={IMAGE} />
      </Section>

      <hr />

      <Section
        title="Vector editing"
        description="Tangent-mirroring modes for bezier anchor handles. Promoted to @grida/react-icons (root)."
      >
        <IconGrid entries={VECTOR} />
      </Section>

      {UNGROUPED.length > 0 ? (
        <>
          <hr />

          <Section
            title="Ungrouped"
            description="Root exports not yet placed in a semantic group above — enumerated from the package automatically, so nothing it ships is missing from this page."
          >
            <IconGrid entries={UNGROUPED} />
          </Section>
        </>
      ) : null}

      <hr />

      <Section
        title="Stroke decoration"
        description="Marker / endpoint primitives — not yet promoted (couples @grida/cg + flex composites). The composite renderers require a `value` preset and are omitted here."
      >
        <IconGrid entries={STROKE_DECORATION} />
      </Section>
    </main>
  );
}

import type { Metadata } from "next";
import React from "react";

// Logos (incl. the Grida brand mark) — the explicit /logos subpath.
import {
  GridaLogo,
  AppleLogo,
  BirdLogo,
  GoogleLogo,
  KakaoTalkLogo,
  SupabaseLogo,
  WhatsAppLogo,
  StripeBadgeLogo,
  StripeWordmarkLogo,
  TossLogo,
  PostgreSQLLogo,
  WindowsLogo,
  SlackLogo,
  XLogo,
  AnthropicLogo,
  OpenAILogo,
  LinuxLogo,
  NpmLogo,
  UnsplashLogo,
  SalesforceLogo,
  BlackForestLabsLogo,
  ACMELogo,
  LeviLogo,
} from "@grida/react-icons/logos";

// Core editor / graphics-design glyphs — the package root.
import {
  PlayFilledIcon,
  PauseFilledRoundedIcon,
  FeNoiseIcon,
  FeBackdropBlurIcon,
  FeLayerBlurIcon,
  FeGlassIcon,
  SolidPaintIcon,
  LinearGradientPaintIcon,
  RadialGradientPaintIcon,
  SweepGradientPaintIcon,
  DiamondGradientPaintIcon,
  ImagePaintIcon,
  BlendModeIcon,
  RemoveBackgroundIcon,
  UpscaleIcon,
  MirroringAllIcon,
  MirroringAngleIcon,
  MirroringNoneIcon,
} from "@grida/react-icons";

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

// ── Promoted to @grida/react-icons/logos (source paths dropped) ──────────────

const BRAND: IconEntry[] = [{ name: "GridaLogo", Comp: GridaLogo }];

const LOGOS: IconEntry[] = [
  { name: "AppleLogo", Comp: AppleLogo },
  { name: "BirdLogo", Comp: BirdLogo },
  { name: "GoogleLogo", Comp: GoogleLogo },
  { name: "KakaoTalkLogo", Comp: KakaoTalkLogo },
  { name: "SupabaseLogo", Comp: SupabaseLogo },
  { name: "WhatsAppLogo", Comp: WhatsAppLogo },
  { name: "StripeBadgeLogo", Comp: StripeBadgeLogo },
  { name: "StripeWordmarkLogo", Comp: StripeWordmarkLogo },
  { name: "TossLogo", Comp: TossLogo },
  { name: "PostgreSQLLogo", Comp: PostgreSQLLogo },
  { name: "WindowsLogo", Comp: WindowsLogo },
  { name: "SlackLogo", Comp: SlackLogo },
  { name: "XLogo", Comp: XLogo },
  { name: "AnthropicLogo", Comp: AnthropicLogo },
  { name: "OpenAILogo", Comp: OpenAILogo },
  { name: "LinuxLogo", Comp: LinuxLogo },
  { name: "NpmLogo", Comp: NpmLogo },
  { name: "UnsplashLogo", Comp: UnsplashLogo },
  { name: "SalesforceLogo", Comp: SalesforceLogo },
  { name: "BlackForestLabsLogo", Comp: BlackForestLabsLogo },
  { name: "ACMELogo", Comp: ACMELogo },
  { name: "LeviLogo", Comp: LeviLogo },
];

// ── Promoted to @grida/react-icons root — grouped by SEMANTIC role, not by the
//    editor directory the source happened to live in ──────────────────────────

const MEDIA: IconEntry[] = [
  { name: "PlayFilledIcon", Comp: PlayFilledIcon },
  { name: "PauseFilledRoundedIcon", Comp: PauseFilledRoundedIcon },
];

const FILTER_FX: IconEntry[] = [
  { name: "FeNoiseIcon", Comp: FeNoiseIcon },
  { name: "FeBackdropBlurIcon", Comp: FeBackdropBlurIcon },
  { name: "FeLayerBlurIcon", Comp: FeLayerBlurIcon },
  { name: "FeGlassIcon", Comp: FeGlassIcon },
];

const PAINT: IconEntry[] = [
  { name: "SolidPaintIcon", Comp: SolidPaintIcon },
  { name: "LinearGradientPaintIcon", Comp: LinearGradientPaintIcon },
  { name: "RadialGradientPaintIcon", Comp: RadialGradientPaintIcon },
  { name: "SweepGradientPaintIcon", Comp: SweepGradientPaintIcon },
  { name: "DiamondGradientPaintIcon", Comp: DiamondGradientPaintIcon },
  { name: "ImagePaintIcon", Comp: ImagePaintIcon },
];

const BLEND: IconEntry[] = [{ name: "BlendModeIcon", Comp: BlendModeIcon }];

const IMAGE: IconEntry[] = [
  { name: "RemoveBackgroundIcon", Comp: RemoveBackgroundIcon },
  { name: "UpscaleIcon", Comp: UpscaleIcon },
];

const VECTOR: IconEntry[] = [
  { name: "MirroringAllIcon", Comp: MirroringAllIcon },
  { name: "MirroringAngleIcon", Comp: MirroringAngleIcon },
  { name: "MirroringNoneIcon", Comp: MirroringNoneIcon },
];

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
  BRAND.length +
  LOGOS.length +
  MEDIA.length +
  FILTER_FX.length +
  PAINT.length +
  BLEND.length +
  IMAGE.length +
  VECTOR.length;

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

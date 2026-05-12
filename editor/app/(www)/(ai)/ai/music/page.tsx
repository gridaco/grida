import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import Header from "@/www/header";
import Footer from "@/www/footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRightIcon, SparklesIcon } from "lucide-react";
import ai from "@/lib/ai";
import showcaseManifest from "@/public/ai/music/showcase/manifest.json";
import { TrackShowcase } from "./_components/track-showcase";
import { HeroPromptInput } from "./_components/hero-prompt-input";
import { Matrix } from "@/www/ui/matrix";

export const metadata: Metadata = {
  title: "AI Music Generator — Powered by Google Lyria 3 | Grida",
  description:
    "Generate original music with Google Lyria 3 and Lyria 3 Pro. Turn a text prompt or reference image into 48kHz stereo audio. Free monthly budget — no credit card.",
  keywords: [
    "ai music generator",
    "ai music",
    "lyria 3",
    "lyria 3 pro",
    "google lyria",
    "text to music",
    "image to music",
    "ai song generator",
    "music generation api",
    "free ai music",
  ],
  alternates: {
    canonical: "https://grida.co/ai/music",
  },
  openGraph: {
    title: "AI Music Generator — Powered by Google Lyria 3 | Grida",
    description:
      "Generate original music with Lyria 3 and Lyria 3 Pro. Text-to-music and image-to-music, free to try.",
    type: "website",
    url: "https://grida.co/ai/music",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Music Generator — Powered by Google Lyria 3 | Grida",
    description:
      "Generate original music with Lyria 3 and Lyria 3 Pro. Free to try.",
  },
};

const PLAYGROUND_HREF = "/ai/music/playground";

const FAQS: { q: string; a: string }[] = [
  {
    q: "What is Lyria 3?",
    a: "Lyria 3 is Google DeepMind's music generation model. It produces 48kHz stereo audio from text prompts and images, with control over genre, tempo, instruments, mood, and structure.",
  },
  {
    q: "What's the difference between Lyria 3 and Lyria 3 Pro?",
    a: "Lyria 3 generates 30-second clips in seconds. Lyria 3 Pro produces full-length tracks up to roughly three minutes with verses, choruses, and bridges.",
  },
  {
    q: "Do I have to pay?",
    a: "No. Sign in with Google and you get a free monthly budget that covers many generations. You only need to upgrade if you go beyond it.",
  },
  {
    q: "Can I use the audio commercially?",
    a: "All output includes SynthID watermarking. Review Google's Lyria terms before commercial use; the output rights follow the upstream provider's policy.",
  },
];

// Curated subset of generated covers used in the Direction collage.
// Picked for palette variety so the collage reads as eclectic, not muddy.
const COLLAGE_IDS = [
  "neon-mile-marker",
  "horizon-of-light",
  "velvet-hour",
  "golden-hour-groove",
  "petals-in-static",
  "floating-memories",
] as const;

const collageCovers = COLLAGE_IDS.map((id) => {
  const t = (
    showcaseManifest as Array<{ id: string; image: string; title: string }>
  ).find((x) => x.id === id);
  return t ?? { id, image: `/ai/music/showcase/${id}.webp`, title: id };
});

export default function MusicLandingPage() {
  const lyria3 = ai.audio.models["google/lyria-3"];
  const lyria3Pro = ai.audio.models["google/lyria-3-pro"];

  const ldJson = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Grida AI Music Generator",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    url: "https://grida.co/ai/music",
    description:
      "Generate music with Google Lyria 3 and Lyria 3 Pro from a text prompt or reference image.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    creator: { "@type": "Organization", name: "Grida" },
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="relative">
      <Header />
      <Script
        id="ldjson-software"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }}
      />
      <Script
        id="ldjson-faq"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      {/* Animation keyframes — pure CSS, no JS required. */}
      <style>{`
        @keyframes lyria-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-10px); }
        }
        .lyria-float {
          animation: lyria-float 7s ease-in-out infinite;
          animation-delay: var(--lyria-float-delay, 0s);
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .lyria-float { animation: none !important; }
        }
      `}</style>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Backdrop gradient */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 0%, hsl(var(--foreground) / 0.07), transparent 70%)",
          }}
        />
        {/* Grid texture */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse 60% 50% at 50% 30%, black, transparent 80%)",
          }}
        />

        <div className="container mx-auto px-4 pt-44 md:pt-56 lg:pt-64 pb-28 md:pb-36">
          <div className="max-w-4xl mx-auto text-center">
            <Badge variant="outline" className="mb-8">
              <SparklesIcon className="size-3 mr-1.5" />
              Powered by Google Lyria 3
            </Badge>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-semibold tracking-tight mb-8">
              Generate music
              <br />
              from a prompt or image
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-14">
              Turn an idea into 48kHz stereo audio with Lyria 3 and Lyria 3 Pro.
              Type a vibe, attach a reference image, hit play.
            </p>
            <HeroPromptInput />
            <div className="mt-8">
              <Link
                href="/ai/models"
                className="text-sm text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
              >
                See all AI models →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Scrolling wave separator — transition from hero into the carousel */}
      <SectionDivider />

      {/* Showcase carousel — real Lyria-3 generations, full-bleed, center-aligned heading */}
      <section className="py-24 overflow-hidden">
        <div className="container mx-auto px-4 mb-14">
          <div className="max-w-6xl mx-auto">
            <SectionHeading
              align="center"
              eyebrow="Listen"
              title="Real tracks made with Lyria 3 Pro"
              description="Every track was generated end-to-end with Lyria 3 Pro (audio) and GPT Image 2 (cover art) from a single prompt. Click play — it'll roll through the rest."
            />
          </div>
        </div>
        <TrackShowcase tracks={showcaseManifest} />
      </section>

      {/* Direction — image in, score out */}
      <DirectionSection covers={collageCovers} />

      {/* Models — combined two-row card, no gap; left = details, right = matrix art silhouette */}
      <section className="container mx-auto px-4 py-24">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            eyebrow="Models"
            title="Sketch in seconds. Compose for minutes."
            description="Lyria 3 turns a quick prompt into a 30-second clip. Lyria 3 Pro arranges it into a full track — verses, choruses, bridges, on cue."
          />
          <div className="mt-12 rounded-2xl border bg-card overflow-hidden divide-y">
            <ModelRow
              card={lyria3}
              tagline="Fast, clip-length"
              bullets={[
                "30-second clips",
                "Generates in 10–20s",
                "Great for ideation, loops, stings",
              ]}
              art="clip"
            />
            <ModelRow
              card={lyria3Pro}
              tagline="Full-length tracks"
              bullets={[
                "Up to ~3 minutes",
                "Verse / chorus / bridge structure",
                "Use timestamps to direct sections",
              ]}
              art="track"
              highlight
            />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="container mx-auto px-4 py-24 border-t">
        <div className="max-w-6xl mx-auto">
          <SectionHeading eyebrow="FAQ" title="Frequently asked questions" />
          <div className="space-y-8 mt-10 max-w-3xl">
            {FAQS.map((f) => (
              <div key={f.q} className="border-b pb-8 last:border-b-0">
                <h3 className="text-base font-medium mb-2">{f.q}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {f.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA — animated waveform backdrop, generous vertical space */}
      <section className="relative overflow-hidden">
        {/* Soft radial wash to seat the section against the page */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 100%, hsl(var(--foreground) / 0.05), transparent 70%)",
          }}
        />

        {/* Matrix waveform backdrop — sized to overflow the widest viewport
            so the wave truly fills the section. A vertical-only mask softens
            the top/bottom into the page; horizontally the canvas extends past
            the visible edges so there are no cutoffs reading as "culled". */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center"
          style={{
            maskImage:
              "linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%)",
          }}
        >
          <Matrix
            rows={CTA_ROWS}
            cols={CTA_COLS}
            frames={CTA_FRAMES}
            fps={6}
            autoplay
            loop
            size={6}
            gap={4}
            palette={CTA_PALETTE}
            className="text-foreground/25 dark:text-foreground/40 translate-y-16 md:translate-y-24 lg:translate-y-32"
            ariaLabel="Animated waveform"
          />
        </div>

        <div className="container mx-auto px-4 py-32 md:py-44 lg:py-52">
          <div className="max-w-6xl mx-auto">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-4xl md:text-6xl lg:text-7xl font-semibold tracking-tight mb-6">
                Make a track in under a minute
              </h2>
              <p className="text-muted-foreground text-lg md:text-xl mb-12 max-w-xl mx-auto">
                Open the playground and describe what you want to hear.
              </p>
              <Button asChild size="lg" className="h-12 px-6 text-base">
                <Link href={PLAYGROUND_HREF}>
                  Open the playground
                  <ArrowRightIcon className="size-4 ml-2" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function DirectionSection({
  covers,
}: {
  covers: { id: string; image: string; title: string }[];
}) {
  return (
    <section className="container mx-auto px-4 py-24 lg:py-32">
      <div className="max-w-6xl mx-auto">
        <SectionHeading
          eyebrow="Direction"
          title="Direct any second of your track."
          description="Bring an image for the mood. Score the song with [Section] tags and [mm:ss] timestamps. Lyria 3 Pro plays it back, beat for beat."
        />
        <div className="mt-16 md:mt-20 grid lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-16 items-start">
          <PromptShowcase />
          <CoverCollage covers={covers} />
        </div>
      </div>
    </section>
  );
}

// The whole prompt is just typography. The only "design" is contrast:
// muted lines ghost back, the Bridge stays at full foreground and reads first.
// No backgrounds, no borders, no rounded boxes — Apple-style restraint.
function PromptShowcase() {
  return (
    <div className="font-mono text-[15px] md:text-[17px] leading-[1.9] tracking-tight">
      <PromptLine time="0:00 – 0:18" section="Intro">
        Arpeggiated saw, pad swell, kick at bar 5.
      </PromptLine>
      <PromptLine time="0:18 – 0:45" section="Verse 1" lyric>
        “Headlights cut the fog like a confession,
        <br />
        radio static humming through my chest.”
      </PromptLine>
      <PromptLine time="0:45 – 1:10" section="Chorus">
        Big gated snare, harmonies a 5th up.
      </PromptLine>
      <PromptLine time="1:10 – 1:35" section="Verse 2" lyric>
        “Every exit sign is a promise I outran.”
      </PromptLine>
      <PromptLine time="1:35 – 2:00" section="Chorus">
        Repeat hook, doubled lead.
      </PromptLine>

      <PromptLine highlight time="2:00 – 2:18" section="Bridge" lyric>
        Drums drop to filtered loop, vocoder pad, half-time feel.
        <br />
        “Maybe love’s just a frequency,
        <br />
        fading in, fading out of me.”
      </PromptLine>

      <PromptLine time="2:18 – 2:40" section="Outro">
        Lead synth solo, long tape-delay tail, slow fade.
      </PromptLine>
    </div>
  );
}

function PromptLine({
  time,
  section,
  children,
  highlight,
  lyric,
}: {
  time: string;
  section: string;
  children: React.ReactNode;
  highlight?: boolean;
  lyric?: boolean;
}) {
  return (
    <div className={`my-7 md:my-8 ${highlight ? "" : "opacity-25"}`}>
      <div
        className={`mb-1 ${highlight ? "text-foreground font-medium" : "text-foreground"}`}
      >
        <span className="text-muted-foreground mr-2">[{time}]</span>
        <span>{section}</span>
      </div>
      <div
        className={`${highlight ? "text-foreground" : "text-muted-foreground"} ${lyric ? "italic" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}

// Apple-Music-style lyrics overlay for the hero collage card. Three stanzas
// stack on the cover; the current one (Bridge) is brighter and slightly
// larger, the surrounding stanzas dim back. Mirrors the highlighted Bridge
// block in the prompt on the left, so the eye links the two halves of the
// section.
function HeroLyrics() {
  type Stanza = { lines: string[]; current?: boolean };
  const stanzas: Stanza[] = [
    {
      lines: ["Every exit sign is a promise", "I outran."],
    },
    {
      lines: ["Maybe love's just a frequency,", "fading in, fading out of me."],
      current: true,
    },
    {
      lines: ["Run me through the neon,", "mile after mile."],
    },
  ];
  return (
    <>
      {/* Bottom-weighted gradient so the lyrics read cleanly over any cover */}
      <div className="absolute inset-x-0 bottom-0 h-[78%] bg-gradient-to-t from-black/90 via-black/55 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 p-4 md:p-6">
        {stanzas.map((s, i) => (
          <div
            key={i}
            className={
              "leading-[1.25] tracking-tight " +
              (s.current
                ? "text-white text-[13px] md:text-[15px] font-semibold mb-2.5"
                : "text-white/35 text-[10.5px] md:text-[12px] font-medium mb-2")
            }
          >
            {s.lines.map((line, j) => (
              <p key={j} className="drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]">
                {line}
              </p>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

// A curated, layered collage of generated covers. Composition is intentional:
// one hero card up front; two mid-layer cards flanking; two background cards
// further back, smaller and softly blurred for depth. A blurred halo of the
// hero cover blooms behind the whole stack — Apple/Spotify "now playing"
// energy. Each card has its own gentle floating animation with staggered
// delay so the stack breathes.
function CoverCollage({
  covers,
}: {
  covers: { id: string; image: string; title: string }[];
}) {
  // Curate to exactly 5 — fewer cards, stronger composition.
  const items = covers.slice(0, 5);
  const hero = items[2] ?? items[0];

  // Cards are sized as `w-1/2` of the container; scale + position vary per
  // layer. Sizes vary deliberately for a strong hierarchy: hero up front,
  // medium flanking, small accents in back.
  const layout: {
    x: string;
    y: string;
    r: number; // rotation deg
    s: number; // scale
    z: number;
    blur?: number;
    opacity?: number;
    delay: number;
  }[] = [
    // Back layer — small, soft-blurred accents
    {
      x: "-22%",
      y: "-6%",
      r: -16,
      s: 0.46,
      z: 10,
      blur: 2,
      opacity: 0.78,
      delay: 0.4,
    },
    {
      x: "82%",
      y: "12%",
      r: 18,
      s: 0.5,
      z: 12,
      blur: 2,
      opacity: 0.78,
      delay: 1.1,
    },
    // Hero — large, central, sharp
    { x: "8%", y: "10%", r: -2, s: 1.3, z: 50, delay: 0 },
    // Mid-layer flanking
    { x: "68%", y: "52%", r: 11, s: 0.86, z: 30, delay: 1.6 },
    { x: "-16%", y: "62%", r: -9, s: 0.7, z: 25, delay: 0.9 },
  ];

  return (
    <div className="relative aspect-square w-full -mx-2 md:-mx-6" aria-hidden>
      {/* Hero bloom — blurred copy of the hero cover saturating behind */}
      <div
        className="absolute inset-0 -z-10 opacity-55"
        style={{
          backgroundImage: `url(${hero.image})`,
          backgroundSize: "75%",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          filter: "blur(60px) saturate(1.35)",
        }}
      />

      {items.map((c, i) => {
        const L = layout[i];
        const isHero = c.id === hero.id;
        return (
          <div
            key={c.id}
            className="absolute top-0 left-0 w-1/2 aspect-square will-change-transform"
            style={{
              transform: `translate(${L.x}, ${L.y}) rotate(${L.r}deg) scale(${L.s})`,
              zIndex: L.z,
              opacity: L.opacity ?? 1,
              filter: L.blur ? `blur(${L.blur}px)` : undefined,
            }}
          >
            <div
              className="lyria-float relative w-full h-full rounded-xl overflow-hidden bg-card shadow-[0_18px_40px_-22px_rgba(0,0,0,0.3)]"
              style={{ animationDelay: `${L.delay}s` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.image}
                alt={c.title}
                className="w-full h-full object-cover"
                draggable={false}
              />
              {isHero && <HeroLyrics />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "left" | "center";
}) {
  const isCenter = align === "center";
  return (
    <div
      className={
        isCenter ? "max-w-2xl mx-auto text-center" : "max-w-2xl text-left"
      }
    >
      <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground mb-3">
        {eyebrow}
      </div>
      <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
        {title}
      </h2>
      {description && (
        <p
          className={`text-muted-foreground mt-4 text-base md:text-lg ${
            isCenter ? "mx-auto" : ""
          }`}
        >
          {description}
        </p>
      )}
    </div>
  );
}

function SectionDivider() {
  // Same animated waveform as the CTA backdrop, rendered with the same pixel
  // cell size (size=6, gap=4) so the canvas reaches the full ~2400px width.
  // Slimmer rows make this read as a divider band instead of a hero backdrop.
  return (
    <div
      aria-hidden
      className="relative w-full overflow-hidden flex items-center justify-center"
      style={{
        maskImage:
          "linear-gradient(to bottom, transparent 0%, black 25%, black 75%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, black 25%, black 75%, transparent 100%)",
      }}
    >
      <Matrix
        rows={DIVIDER_ROWS}
        cols={DIVIDER_COLS}
        frames={DIVIDER_FRAMES}
        fps={6}
        autoplay
        loop
        size={6}
        gap={4}
        palette={CTA_PALETTE}
        className="text-foreground/35 dark:text-foreground/55"
        ariaLabel="Scrolling wave divider"
      />
    </div>
  );
}

function ModelRow({
  card,
  tagline,
  bullets,
  art,
  highlight,
}: {
  card: ai.audio.AudioModelCard;
  tagline: string;
  bullets: string[];
  art: "clip" | "track";
  highlight?: boolean;
}) {
  return (
    <div
      className={`group/row grid md:grid-cols-[1.25fr_1fr] items-stretch transition-colors ${
        highlight ? "bg-card" : "bg-card"
      }`}
    >
      {/* Left: model details */}
      <div className="p-8 md:p-10 flex flex-col">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-2xl md:text-3xl font-semibold tracking-tight">
            {card.label}
          </h3>
          <Badge variant="outline">~{card.duration_label}</Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-3">{tagline}</p>
        <p className="text-sm text-muted-foreground leading-relaxed mb-5 max-w-md">
          {card.short_description}
        </p>
        <ul className="space-y-1.5 text-sm mb-6">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <span className="text-muted-foreground/60 mt-0.5">/</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto">
          <Button asChild variant={highlight ? "default" : "outline"}>
            <Link href={PLAYGROUND_HREF}>
              Try {card.label}
              <ArrowRightIcon className="size-4 ml-2" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Right: abstract Matrix silhouette — neutral by default, Lyria mint on row hover */}
      <div className="relative border-t md:border-t-0 md:border-l flex items-center justify-center p-6 md:p-8 min-h-[220px] overflow-hidden bg-muted/30 transition-colors duration-500">
        {/* Pale mint wash + glow — fade in on hover */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover/row:opacity-100"
          style={{
            background:
              "linear-gradient(180deg, #eafbf0 0%, #d6f5e0 60%, #c2efd2 100%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover/row:opacity-100"
          style={{
            background:
              "radial-gradient(ellipse 70% 80% at 50% 60%, rgba(75, 222, 142, 0.35), transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-0 transition-opacity duration-700 group-hover/row:opacity-100"
          style={{
            background:
              "linear-gradient(180deg, transparent, rgba(120, 230, 160, 0.45))",
            filter: "blur(20px)",
          }}
        />

        {/* Matrix art — neutral static state */}
        <div className="relative transition-opacity duration-500 group-hover/row:opacity-0">
          {art === "clip" ? (
            <ClipMatrixArt mode="static-neutral" />
          ) : (
            <TrackMatrixArt mode="static-neutral" />
          )}
        </div>
        {/* Matrix art — Lyria mint, animated, fades in on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-500 group-hover/row:opacity-100">
          {art === "clip" ? (
            <ClipMatrixArt mode="animated-lyria" />
          ) : (
            <TrackMatrixArt mode="animated-lyria" />
          )}
        </div>
      </div>
    </div>
  );
}

// Pre-computed brightness arrays for the Matrix dot-grid silhouettes.
// Both rendered with palette `on: currentColor` so they pick up text color.

const CLIP_PATTERN: number[][] = (() => {
  const rows = 14;
  const cols = 28;
  // Heights for each column, deterministic, "audio meter" feel.
  const heights = [
    0.28, 0.5, 0.42, 0.7, 0.55, 0.78, 0.95, 0.55, 0.66, 0.85, 0.42, 0.74, 0.58,
    0.7, 0.95, 0.62, 0.5, 0.82, 0.45, 0.7, 0.55, 0.4, 0.62, 0.5, 0.7, 0.85,
    0.45, 0.6,
  ];
  const out: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    const fromBottom = (rows - 1 - r) / (rows - 1); // 0 at bottom, 1 at top
    for (let c = 0; c < cols; c++) {
      const h = heights[c % heights.length];
      // Bar is "on" if its height reaches this row's y-from-bottom.
      // Slight gradient near the tip to soften the silhouette.
      if (fromBottom <= h - 0.05) row.push(1);
      else if (fromBottom <= h) row.push(0.55);
      else row.push(0);
    }
    out.push(row);
  }
  return out;
})();

const TRACK_PATTERN: number[][] = (() => {
  const rows = 14;
  const cols = 36;
  const out: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c++) {
      const x = (c / (cols - 1)) * Math.PI * 4;
      const y =
        0.5 +
        0.32 * Math.sin(x) +
        0.12 * Math.sin(x * 2.1 + 0.7) +
        0.06 * Math.sin(x * 4.3 + 1.2);
      const center = (rows - 1) * y;
      const d = Math.abs(r - center);
      if (d < 0.5) row.push(1);
      else if (d < 1.2) row.push(0.65);
      else if (d < 1.8) row.push(0.3);
      else row.push(0);
    }
    out.push(row);
  }
  return out;
})();

// Wave-frame builder used by both the CTA backdrop and the hero divider.
// Multi-frequency sine envelope (sin + sin·1.7 + sin·3.1) gives an organic
// non-repeating feel. `cycles` decouples the wavelength from `cols` — bumping
// cols just extends reach without resampling the shape.
function buildWaveFrames({
  rows,
  cols,
  cycles,
  frameCount,
}: {
  rows: number;
  cols: number;
  cycles: number;
  frameCount: number;
}): number[][][] {
  const out: number[][][] = [];
  for (let f = 0; f < frameCount; f++) {
    const shift = (f / frameCount) * Math.PI * 2;
    const frame: number[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      for (let c = 0; c < cols; c++) {
        const x = (c / (cols - 1)) * Math.PI * 2 * cycles + shift;
        const y =
          0.5 +
          0.32 * Math.sin(x) +
          0.14 * Math.sin(x * 1.7 + 0.5) +
          0.08 * Math.sin(x * 3.1 + 1.3);
        const center = (rows - 1) * y;
        const d = Math.abs(r - center);
        if (d < 0.5) row.push(1);
        else if (d < 1.2) row.push(0.7);
        else if (d < 2.0) row.push(0.35);
        else row.push(0);
      }
      frame.push(row);
    }
    out.push(frame);
  }
  return out;
}

// CTA waveform backdrop — wide enough to overflow even ultra-wide viewports
// (240 cols × 10px cell ≈ 2400px) so it always extends past the section edges.
const CTA_ROWS = 22;
const CTA_COLS = 240;
const CTA_FRAMES = buildWaveFrames({
  rows: CTA_ROWS,
  cols: CTA_COLS,
  cycles: 12,
  frameCount: 48,
});

// Hero divider — same wave shape as the CTA, slimmer vertically (14 rows ×
// 10px cell ≈ 136px tall). Same column count so the canvas is full-bleed at
// the same pixel cell size as the CTA.
const DIVIDER_ROWS = 14;
const DIVIDER_COLS = 240;
const DIVIDER_FRAMES = buildWaveFrames({
  rows: DIVIDER_ROWS,
  cols: DIVIDER_COLS,
  cycles: 12,
  frameCount: 48,
});

// CTA palette: ON inherits `currentColor` (driven by Tailwind class on the
// Matrix element), OFF is fully transparent so the backdrop stays clean — no
// faint dot grid behind the heading.
const CTA_PALETTE = {
  on: "currentColor",
  off: "transparent",
} as const;

// Lyria brand palette — vivid spring green stays constant in both themes;
// the OFF dots use the theme's muted token so they're readable on light cards
// and dark cards alike.
const LYRIA_PALETTE = {
  on: "#3DD787",
  off: "var(--muted-foreground)",
} as const;

// Neutral palette: ON resolves to `currentColor`, so the caller controls the
// tint via Tailwind `text-*` / `dark:text-*` on the Matrix element. OFF rides
// the theme's muted-foreground token. No more invalid `hsl(oklch(...))`.
const NEUTRAL_PALETTE = {
  on: "currentColor",
  off: "var(--muted-foreground)",
} as const;

const CLIP_ROWS = 14;
const CLIP_COLS = 28;
const TRACK_ROWS = 14;
const TRACK_COLS = 36;

// Pre-compute animated frames: vertical bars subtly oscillate like a real
// audio meter. Each frame applies a phase-shifted wobble per column.
const CLIP_FRAMES: number[][][] = (() => {
  const frameCount = 16;
  const baseHeights = [
    0.32, 0.5, 0.42, 0.7, 0.55, 0.78, 0.95, 0.55, 0.66, 0.85, 0.42, 0.74, 0.58,
    0.7, 0.95, 0.62, 0.5, 0.82, 0.45, 0.7, 0.55, 0.4, 0.62, 0.5, 0.7, 0.85,
    0.45, 0.6,
  ];
  const out: number[][][] = [];
  for (let f = 0; f < frameCount; f++) {
    const phase = (f / frameCount) * Math.PI * 2;
    const heights = baseHeights.map((h, c) => {
      const wobble = 0.18 * Math.sin(phase + c * 0.32);
      return Math.max(0.16, Math.min(1.0, h + wobble));
    });
    const frame: number[][] = [];
    for (let r = 0; r < CLIP_ROWS; r++) {
      const row: number[] = [];
      const fromBottom = (CLIP_ROWS - 1 - r) / (CLIP_ROWS - 1);
      for (let c = 0; c < CLIP_COLS; c++) {
        const h = heights[c % heights.length];
        if (fromBottom <= h - 0.05) row.push(1);
        else if (fromBottom <= h) row.push(0.55);
        else row.push(0);
      }
      frame.push(row);
    }
    out.push(frame);
  }
  return out;
})();

// Pre-compute animated frames: a flowing waveform that scrolls horizontally.
const TRACK_FRAMES: number[][][] = (() => {
  const frameCount = 24;
  const out: number[][][] = [];
  for (let f = 0; f < frameCount; f++) {
    const shift = (f / frameCount) * Math.PI * 2;
    const frame: number[][] = [];
    for (let r = 0; r < TRACK_ROWS; r++) {
      const row: number[] = [];
      for (let c = 0; c < TRACK_COLS; c++) {
        const x = (c / (TRACK_COLS - 1)) * Math.PI * 4 + shift;
        const y =
          0.5 +
          0.32 * Math.sin(x) +
          0.12 * Math.sin(x * 2.1 + 0.7) +
          0.06 * Math.sin(x * 4.3 + 1.2);
        const center = (TRACK_ROWS - 1) * y;
        const d = Math.abs(r - center);
        if (d < 0.5) row.push(1);
        else if (d < 1.2) row.push(0.65);
        else if (d < 1.8) row.push(0.3);
        else row.push(0);
      }
      frame.push(row);
    }
    out.push(frame);
  }
  return out;
})();

type MatrixMode = "static-neutral" | "animated-lyria";

function ClipMatrixArt({ mode }: { mode: MatrixMode }) {
  if (mode === "animated-lyria") {
    return (
      <Matrix
        rows={CLIP_ROWS}
        cols={CLIP_COLS}
        frames={CLIP_FRAMES}
        fps={8}
        autoplay
        loop
        size={9}
        gap={3}
        palette={LYRIA_PALETTE}
        ariaLabel="Animated Lyria clip waveform"
      />
    );
  }
  return (
    <Matrix
      rows={CLIP_ROWS}
      cols={CLIP_COLS}
      pattern={CLIP_PATTERN}
      size={9}
      gap={3}
      palette={NEUTRAL_PALETTE}
      className="text-foreground/60 dark:text-foreground/80"
      ariaLabel="Clip waveform matrix art"
    />
  );
}

function TrackMatrixArt({ mode }: { mode: MatrixMode }) {
  if (mode === "animated-lyria") {
    return (
      <Matrix
        rows={TRACK_ROWS}
        cols={TRACK_COLS}
        frames={TRACK_FRAMES}
        fps={8}
        autoplay
        loop
        size={8}
        gap={3}
        palette={LYRIA_PALETTE}
        ariaLabel="Animated Lyria full-track waveform"
      />
    );
  }
  return (
    <Matrix
      rows={TRACK_ROWS}
      cols={TRACK_COLS}
      pattern={TRACK_PATTERN}
      size={8}
      gap={3}
      palette={NEUTRAL_PALETTE}
      className="text-foreground/60 dark:text-foreground/80"
      ariaLabel="Full-track waveform matrix art"
    />
  );
}

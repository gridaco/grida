import Link from "next/link";
import models from "@grida/ai-models";
import { Badge } from "@app/ui/components/badge";
import { Button } from "@app/ui/components/button";
import {
  ArrowRightIcon,
  ExternalLinkIcon,
  ImageIcon,
  SparklesIcon,
} from "lucide-react";
import showcaseManifest from "@/public/ai/music/showcase/manifest.json";
import { aiModelPages } from "@/www/data/ai-model-pages";

const model = (() => {
  const card = models.image.models["openai/gpt-image-2"];
  if (!card) {
    throw new Error("GPT Image 2 is missing from the image model catalogue");
  }
  return card;
})();

const SHOWCASE = [
  {
    id: "neon-honey-rush",
    label: "Material study",
    alt: "A luminous glass heart filled with honey in a neon still life, generated with GPT Image 2",
    layout: "md:col-span-7 md:row-span-2",
  },
  {
    id: "horizon-of-light",
    label: "Fantasy environment",
    alt: "A lone traveler overlooking a radiant fantasy landscape, generated with GPT Image 2",
    layout: "md:col-span-7 md:row-span-2",
  },
  {
    id: "lamplight-letters",
    label: "Editorial interior",
    alt: "A warmly lit room with an acoustic guitar and writing desk, generated with GPT Image 2",
    layout: "md:col-span-5",
  },
  {
    id: "fracture-protocol",
    label: "Concept art",
    alt: "A fractured monolithic structure suspended over a stormy landscape, generated with GPT Image 2",
    layout: "md:col-span-5",
  },
  {
    id: "petals-in-static",
    label: "Dreamlike photography",
    alt: "A soft-focus figure walking through a pastel flower field, generated with GPT Image 2",
    layout: "md:col-span-4",
  },
  {
    id: "midnight-ink-cipher",
    label: "Cinematic still life",
    alt: "A notebook, headphones, and record beside a window at night, generated with GPT Image 2",
    layout: "md:col-span-4",
  },
  {
    id: "golden-hour-groove",
    label: "Editorial fashion",
    alt: "A figure in deep red clothing on a city terrace at golden hour, generated with GPT Image 2",
    layout: "md:col-span-4",
  },
] as const;

type MusicShowcaseEntry = (typeof showcaseManifest)[number];

type ShowcaseOutput = MusicShowcaseEntry & (typeof SHOWCASE)[number];

const outputs: ShowcaseOutput[] = SHOWCASE.map((selection) => {
  const source = showcaseManifest.find((entry) => entry.id === selection.id);
  if (!source) {
    throw new Error(`Missing GPT Image 2 showcase output: ${selection.id}`);
  }
  return { ...source, ...selection };
});

const heroOutput = outputs[0];
const briefOutput = (() => {
  const output = showcaseManifest.find(
    (entry) => entry.id === "neon-mile-marker"
  );
  if (!output) {
    throw new Error("GPT Image 2 page requires the Neon Mile Marker output");
  }
  return output;
})();

if (!heroOutput) {
  throw new Error("GPT Image 2 page requires its curated showcase outputs");
}

const prices =
  model.pricing.type === "per_image_tiered"
    ? Object.values(model.pricing.tiers)
    : [];

const priceRange = prices.length
  ? `$${Math.min(...prices).toFixed(3)}–$${Math.max(...prices).toFixed(3)}`
  : "Varies by request";

const minMegapixels = model.constraints?.min_pixels
  ? (model.constraints.min_pixels / 1_000_000).toFixed(3)
  : null;
const maxMegapixels = model.constraints?.max_pixels
  ? (model.constraints.max_pixels / 1_000_000).toFixed(2)
  : null;
const defaultSize = `${model.default.width}×${model.default.height}`;
const speedEstimate = model.speed_max
  ? `~${model.speed_max}`
  : model.speed_label;
const creativeBrief = briefOutput.prompt.split("\n\n")[0];

function publishedPrice(key: string): string {
  if (model.pricing.type !== "per_image_tiered") {
    throw new Error("GPT Image 2 requires published tiered pricing");
  }
  const price = model.pricing.tiers[key];
  if (price === undefined) {
    throw new Error(`GPT Image 2 is missing published price: ${key}`);
  }
  return `$${price.toFixed(3)}`;
}

const PRICE_ROWS = [
  {
    quality: "Low",
    square: publishedPrice("low/1024x1024"),
    portrait: publishedPrice("low/1024x1536"),
    landscape: publishedPrice("low/1536x1024"),
  },
  {
    quality: "Medium",
    square: publishedPrice("medium/1024x1024"),
    portrait: publishedPrice("medium/1024x1536"),
    landscape: publishedPrice("medium/1536x1024"),
  },
  {
    quality: "High",
    square: publishedPrice("high/1024x1024"),
    portrait: publishedPrice("high/1024x1536"),
    landscape: publishedPrice("high/1536x1024"),
  },
] as const;

const FAQS = [
  {
    question: "What is GPT Image 2?",
    answer:
      "GPT Image 2 is OpenAI’s image generation and editing model. It accepts text and image input, produces image output, and supports flexible image sizes. Grida’s current playground exposes its text-to-image generation path.",
  },
  {
    question: "What image sizes can I generate in Grida?",
    answer: `The playground offers ${model.sizes?.map(([width, height]) => `${width}×${height}`).join(", ")} presets. GPT Image 2 also supports custom dimensions in 16-pixel steps inside its published ${minMegapixels}–${maxMegapixels} megapixel envelope, up to a 3:1 aspect ratio.`,
  },
  {
    question: "How much does a GPT Image 2 generation cost?",
    answer: `Published image-output pricing currently ranges from ${priceRange} per image depending on quality and size. The current Grida playground debits the selected preset at its catalogue medium-tier amount from your organization’s available AI credit; access is based on entitlement, not on how that credit was granted.`,
  },
  {
    question: "Can I edit an existing image with GPT Image 2 in Grida?",
    answer:
      "The upstream model supports image input and editing. The public Grida demo on this page currently supports text-to-image generation only, so we do not present editing controls that are not yet wired.",
  },
] as const;

export function GptImage2Page({ page }: { page: aiModelPages.Entry }) {
  if (page.model.catalogue !== "image" || page.model.id !== model.id) {
    throw new Error(
      `GPT Image 2 page requires registry model ${model.id}, received ${page.model.catalogue}/${page.model.id}`
    );
  }

  const softwareLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "GPT Image 2 AI Image Generator in Grida",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    url: aiModelPages.url(page.slug),
    description: page.metadata.description,
    image: `https://grida.co${page.metadata.image.src}`,
    creator: { "@type": "Organization", name: "Grida" },
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <article data-testid="ai-model-page-gpt-image-2">
      <script
        id="ldjson-gpt-image-2-software"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareLd).replace(/</g, "\\u003c"),
        }}
      />
      <script
        id="ldjson-gpt-image-2-faq"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqLd).replace(/</g, "\\u003c"),
        }}
      />

      <section className="relative overflow-hidden border-b">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.045]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse 72% 74% at 72% 45%, black, transparent 80%)",
          }}
        />
        <div className="container mx-auto px-4 pb-20 pt-32 md:pb-28 md:pt-40">
          <div className="mx-auto grid max-w-6xl gap-0 lg:grid-cols-[0.88fr_1.12fr] lg:grid-rows-2 lg:gap-x-20">
            <div className="lg:self-end">
              <Link
                href="/ai/models"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                AI models
              </Link>
              <div className="mt-8">
                <Badge variant="outline">
                  <SparklesIcon className="mr-1.5 size-3" />
                  OpenAI · GPT Image 2
                </Badge>
              </div>
              <h1 className="mt-8 text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
                GPT Image 2,
                <br />
                ready for the canvas.
              </h1>
              <Button
                asChild
                size="lg"
                className="mt-8 w-full sm:w-auto lg:hidden"
              >
                <Link href={page.demo.href}>
                  Open the playground
                  <ArrowRightIcon className="ml-2 size-4" />
                </Link>
              </Button>
            </div>

            <figure className="relative mx-auto mt-10 w-full max-w-[680px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:self-center">
              <div
                aria-hidden
                className="absolute -inset-6 -z-10 rounded-[2rem] opacity-30 blur-3xl"
                style={{
                  backgroundImage: `url(${heroOutput.image})`,
                  backgroundPosition: "center",
                  backgroundSize: "cover",
                }}
              />
              {/* Direct public URL is intentional: this artwork is itself indexable content. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroOutput.image}
                alt={heroOutput.alt}
                width={1024}
                height={1024}
                fetchPriority="high"
                className="aspect-square w-full rounded-2xl border object-cover shadow-2xl"
              />
              <figcaption className="mt-4 flex items-start justify-between gap-4 text-sm">
                <div>
                  <p className="font-medium">{heroOutput.title}</p>
                  <p className="mt-1 text-muted-foreground">
                    {heroOutput.label} · Generated with GPT Image 2
                  </p>
                </div>
                <Badge variant="secondary">Real output</Badge>
              </figcaption>
            </figure>

            <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
              <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground md:text-xl">
                Describe the scene in natural language. GPT Image 2 turns it
                into high-resolution artwork, then places the result on a Grida
                canvas where you can keep working.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href={page.demo.href}>
                    Open the playground
                    <ArrowRightIcon className="ml-2 size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href="#examples">Explore real outputs</a>
                </Button>
              </div>
              <dl className="mt-12 grid grid-cols-3 gap-5 border-t pt-6 text-sm">
                <div>
                  <dt className="text-muted-foreground">Input</dt>
                  <dd className="mt-1 font-medium">Natural language</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Default</dt>
                  <dd className="mt-1 font-medium">{defaultSize}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Speed</dt>
                  <dd className="mt-1 font-medium">{speedEstimate}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section
        id="examples"
        className="container mx-auto scroll-mt-24 px-4 py-24 md:py-32"
      >
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Outputs"
            title="One model. Very different directions."
            description="These are real GPT Image 2 outputs made for Grida’s Lyria music showcase. The same model moved from product-like material studies to cinematic environments, interiors, and abstract concept art."
          />
          <div className="mt-14 grid auto-rows-fr gap-4 md:grid-cols-12">
            {outputs.slice(1).map((output) => (
              <figure
                key={output.id}
                className={`${output.layout} group relative min-h-[300px] overflow-hidden rounded-2xl border bg-muted md:min-h-[360px]`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={output.image}
                  alt={output.alt}
                  width={1024}
                  height={1024}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-700 motion-safe:group-hover:scale-[1.02]"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-6 pt-24 text-white">
                  <h3 className="text-lg font-medium">{output.title}</h3>
                  <p className="mt-1 text-sm text-white/70">{output.label}</p>
                </div>
              </figure>
            ))}
          </div>
          <p className="mt-6 max-w-2xl text-sm leading-6 text-muted-foreground">
            Each cover and its companion Lyria track began from one shared
            creative brief. No stock photography is used in this gallery. The
            stored web outputs are 1024×1024; original quality, seed, and
            provider request identifiers were not retained.
          </p>
        </div>
      </section>

      <section className="border-y bg-muted/20">
        <div className="container mx-auto px-4 py-24 md:py-32">
          <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
            <div className="min-w-0">
              <SectionHeading
                eyebrow="Direction"
                title="One direction, two kinds of output."
                description="This retained brief was written to shape a companion track. Its pace, instrumentation, and late-night mood also became the direction for the cover, showing how GPT Image 2 can carry an art direction across media."
              />
              <blockquote className="mt-10 border-l-2 pl-6 text-lg italic leading-8 text-foreground/80">
                “{creativeBrief}”
              </blockquote>
              <p className="mt-5 text-sm leading-6 text-muted-foreground">
                Excerpt from the shared brief behind “Neon Mile Marker.” The
                same source prompt directed both its Lyria track and GPT Image 2
                cover artwork. For a direct image request, be more explicit
                about the subject, composition, materials, lighting, and any
                words that must appear.
              </p>
              <details className="mt-7 border-y py-4 text-sm">
                <summary className="cursor-pointer font-medium">
                  Read the complete creative brief
                </summary>
                <p className="mt-5 whitespace-pre-wrap leading-7 text-muted-foreground">
                  {briefOutput.prompt}
                </p>
              </details>
              <Button asChild variant="outline" className="mt-8">
                <Link href="/ai/music">
                  Hear the companion track
                  <ArrowRightIcon className="ml-2 size-4" />
                </Link>
              </Button>
            </div>
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={briefOutput.image}
                alt="A black sports car beside a neon highway under a full moon, generated with GPT Image 2"
                width={1024}
                height={1024}
                loading="lazy"
                className="aspect-square w-full rounded-2xl border object-cover shadow-xl"
              />
              <figcaption className="mt-4 text-sm text-muted-foreground">
                Neon Mile Marker · GPT Image 2 output
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-24 md:py-32">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-end gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <SectionHeading
              eyebrow="Composition"
              title="Three frames, ready in the playground."
              description="Grida currently exposes square, portrait, and landscape presets. The upstream model supports a wider custom-size envelope, but we keep that capability separate from controls that are actually playable today."
            />
            <FrameDiagram />
          </div>

          <dl className="mt-16 grid border-y sm:grid-cols-2 lg:grid-cols-4 lg:divide-x">
            <Fact
              label="Preset outputs"
              value={
                model.sizes
                  ?.map(([width, height]) => `${width}×${height}`)
                  .join(" · ") ?? "Flexible"
              }
            />
            <Fact
              label="Upstream size envelope"
              value={`${minMegapixels}–${maxMegapixels} MP`}
            />
            <Fact
              label="Published output price"
              value={`${priceRange} / image`}
            />
            <Fact label="Catalogue ID" value={model.id} mono />
          </dl>

          <div className="mt-20 grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Published pricing
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
                Output price follows quality and frame.
              </h2>
              <p className="mt-5 text-sm leading-7 text-muted-foreground">
                These are OpenAI’s published image-output prices for the three
                presets. OpenAI may also charge for prompt or reference-image
                input tokens. Grida’s current playground exposes size—not a
                quality picker—and prices the request against the medium output
                tier for the selected preset.
              </p>
            </div>
            <div className="min-w-0">
              <p className="mb-3 text-xs text-muted-foreground sm:hidden">
                Swipe or scroll horizontally to compare every size.
              </p>
              <div
                role="region"
                aria-label="Scrollable GPT Image 2 pricing table"
                tabIndex={0}
                className="overflow-x-auto rounded-2xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <table className="w-full min-w-[560px] text-left text-sm">
                  <caption className="sr-only">
                    Published GPT Image 2 output prices by quality and image
                    size
                  </caption>
                  <thead className="border-b bg-muted/40 text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-5 py-4 font-medium">
                        Quality
                      </th>
                      <th scope="col" className="px-5 py-4 font-medium">
                        1024×1024
                      </th>
                      <th scope="col" className="px-5 py-4 font-medium">
                        1024×1536
                      </th>
                      <th scope="col" className="px-5 py-4 font-medium">
                        1536×1024
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {PRICE_ROWS.map((row) => (
                      <tr key={row.quality}>
                        <th scope="row" className="px-5 py-4 font-medium">
                          {row.quality}
                        </th>
                        <td className="px-5 py-4 font-mono">{row.square}</td>
                        <td className="px-5 py-4 font-mono">{row.portrait}</td>
                        <td className="px-5 py-4 font-mono">{row.landscape}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-foreground text-background">
        <div className="container mx-auto px-4 py-24 md:py-32">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-background/55">
                  In Grida
                </p>
                <h2 className="mt-4 text-4xl font-semibold tracking-tight md:text-6xl">
                  Generate, then continue on the canvas.
                </h2>
                <p className="mt-6 max-w-xl text-lg leading-8 text-background/65">
                  The playground keeps GPT Image 2 selected, generates through
                  Grida-hosted AI, and places the result directly into a canvas.
                  Authentication and organization credit are requested only when
                  execution requires them.
                </p>
                <Button asChild size="lg" variant="secondary" className="mt-9">
                  <Link href={page.demo.href}>
                    Try GPT Image 2
                    <ArrowRightIcon className="ml-2 size-4" />
                  </Link>
                </Button>
              </div>
              <ol className="grid gap-px overflow-hidden rounded-2xl bg-background/20 sm:grid-cols-3">
                <Step number="01" title="Describe">
                  Write the subject, mood, materials, composition, and light.
                </Step>
                <Step number="02" title="Generate">
                  Choose a frame and run the exact GPT Image 2 model.
                </Step>
                <Step number="03" title="Continue">
                  Inspect the output on a real Grida canvas and keep designing.
                </Step>
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-24 md:py-32">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="FAQ"
            title="GPT Image 2 in Grida"
            description="The practical details before you generate."
          />
          <div className="mt-12 max-w-4xl divide-y border-y">
            {FAQS.map((faq) => (
              <div
                key={faq.question}
                className="grid gap-4 py-8 md:grid-cols-[0.8fr_1.2fr] md:gap-12"
              >
                <h3 className="font-medium">{faq.question}</h3>
                <p className="text-sm leading-7 text-muted-foreground">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
          <a
            href="https://developers.openai.com/api/docs/models/gpt-image-2"
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-flex items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Read the upstream GPT Image 2 model documentation
            <ExternalLinkIcon className="ml-1.5 size-3.5" />
          </a>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-24 md:pb-32">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border bg-muted/30 px-6 py-20 text-center md:px-12 md:py-28">
          <ImageIcon className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
            Give the next image a clear direction.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
            Open the playground with GPT Image 2 already selected. Sign in and
            organization credit are handled at generation time.
          </p>
          <Button asChild size="lg" className="mt-9">
            <Link href={page.demo.href}>
              Open GPT Image 2 playground
              <ArrowRightIcon className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </article>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
        {title}
      </h2>
      <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
        {description}
      </p>
    </div>
  );
}

function FrameDiagram() {
  return (
    <div
      aria-label="GPT Image 2 square, portrait, and landscape output frames"
      className="grid min-h-[200px] grid-cols-3 items-end justify-items-center gap-3 rounded-2xl border bg-muted/20 p-4 sm:min-h-[280px] sm:gap-8 sm:p-8"
    >
      <Frame label="2:3" className="aspect-[2/3] w-full max-w-[140px]" />
      <Frame label="1:1" className="aspect-square w-full max-w-[208px]" />
      <Frame label="3:2" className="aspect-[3/2] w-full max-w-[216px]" />
    </div>
  );
}

function Frame({ label, className }: { label: string; className: string }) {
  return (
    <div
      className={`${className} relative grid place-items-center rounded-lg border bg-background shadow-sm`}
    >
      <span className="font-mono text-xs text-muted-foreground">{label}</span>
      <span className="absolute inset-x-3 bottom-3 h-px bg-border" />
    </div>
  );
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="px-0 py-7 first:pl-0 sm:px-7 lg:first:pl-0 lg:last:pr-0">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-3 text-sm leading-6 ${mono ? "font-mono text-xs" : "font-medium"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: string;
}) {
  return (
    <li className="bg-foreground p-7">
      <p aria-hidden className="font-mono text-xs text-background/45">
        {number}
      </p>
      <h3 className="mt-10 text-xl font-medium">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-background/60">{children}</p>
    </li>
  );
}

import Link from "next/link";
import models from "@grida/ai-models";
import type { models as ModelTypes } from "@grida/ai-models";
import { Button } from "@app/ui/components/button";
import type { aiModelPages } from "@/www/data/ai-model-pages";

const MAKER_NAMES: Record<string, string> = {
  "black-forest-labs": "Black Forest Labs",
  bytedance: "ByteDance",
  elevenlabs: "ElevenLabs",
  google: "Google",
  microsoft: "Microsoft",
  openai: "OpenAI",
  "recraft-ai": "Recraft AI",
  tencent: "Tencent",
  xai: "xAI",
};

const MODALITY_NAMES: Record<
  aiModelPages.MediaModelReference["catalogue"],
  string
> = {
  image: "Image generation",
  video: "Video generation",
  music: "Music generation",
  "sound-effect": "Sound effects",
  "3d": "3D generation",
};

type ModelSummary = {
  id: string;
  label: string;
  description: string;
  maker: string;
  modality: string;
  facts: readonly { label: string; value: string }[];
};

function dollars(value: number): string {
  const precision = Number.isInteger(value * 100) ? 2 : 3;
  return `$${value.toFixed(precision)}`;
}

function duration(value: string): string {
  const match = /^(\d+)([sm])$/.exec(value);
  if (!match) return value;
  const count = Number(match[1]);
  const unit = match[2] === "m" ? "minute" : "second";
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

function imageFacts(
  card: ModelTypes.image.ImageModelCard
): ModelSummary["facts"] {
  const facts: { label: string; value: string }[] = [];

  if (card.sizes?.length) {
    facts.push({
      label: "Output presets",
      value: card.sizes
        .map(([width, height]) => `${width}×${height}`)
        .join(", "),
    });
  }

  if (card.constraints) {
    const { step, max_edge, min_pixels, max_pixels, aspect_ratio } =
      card.constraints;
    const values = [
      step ? `${step} px steps` : null,
      max_edge ? `up to ${max_edge.toLocaleString()} px per edge` : null,
      min_pixels && max_pixels
        ? `${(min_pixels / 1_000_000).toFixed(3)}–${(
            max_pixels / 1_000_000
          ).toFixed(2)} MP`
        : max_pixels
          ? `up to ${(max_pixels / 1_000_000).toFixed(2)} MP`
          : null,
      aspect_ratio?.max ? `up to ${aspect_ratio.max}:1` : null,
    ].filter((value): value is string => Boolean(value));
    if (values.length) {
      facts.push({ label: "Custom size envelope", value: values.join(" · ") });
    }
  }

  if (card.pricing.type === "per_image_tiered") {
    const prices = Object.values(card.pricing.tiers);
    facts.push({
      label: "Published output price",
      value: `${dollars(Math.min(...prices))}–${dollars(Math.max(...prices))} per image`,
    });
  } else if (card.pricing.type === "per_image_flat") {
    facts.push({
      label: "Published output price",
      value: `${dollars(card.pricing.usd)} per image`,
    });
  }

  facts.push({
    label: "Speed estimate",
    value: `~${duration(card.speed_max)}`,
  });
  return facts;
}

function resolveModel(
  reference: aiModelPages.MediaModelReference
): ModelSummary {
  const card = (() => {
    switch (reference.catalogue) {
      case "image":
        return models.image.models[reference.id];
      case "video":
        return models.video.models[reference.id];
      case "music":
        return models.audio.music.models[reference.id];
      case "sound-effect":
        return models.audio.sound_effects.models[reference.id];
      case "3d":
        return models.three_d.models[reference.id];
    }
  })();

  if (!card) {
    throw new Error(
      `AI model page references a missing catalogue record: ${reference.catalogue}/${reference.id}`
    );
  }

  return {
    id: card.id,
    label: card.label,
    description: card.short_description,
    maker: MAKER_NAMES[card.vendor] ?? card.vendor,
    modality: MODALITY_NAMES[reference.catalogue],
    facts:
      reference.catalogue === "image"
        ? imageFacts(models.image.models[reference.id]!)
        : [],
  };
}

function heading(title: string): string {
  return title.endsWith(" — Grida")
    ? title.slice(0, -" — Grida".length)
    : title;
}

export function ModelOverview({ page }: { page: aiModelPages.Entry }) {
  const primary = resolveModel(page.model);

  return (
    <article
      data-testid="ai-model-overview"
      className="container mx-auto px-4 pb-24 pt-32 md:pb-32 md:pt-40"
    >
      <div className="mx-auto max-w-5xl">
        <header className="max-w-3xl">
          <Link
            href="/ai/models"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            AI models
          </Link>
          <h1 className="mt-8 text-4xl font-semibold tracking-tight md:text-6xl">
            {heading(page.metadata.title)}
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            {page.metadata.description}
          </p>
        </header>

        <section
          aria-labelledby="model-capabilities"
          className="mt-20 max-w-4xl"
        >
          <h2
            id="model-capabilities"
            className="text-2xl font-semibold tracking-tight"
          >
            Model capabilities
          </h2>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">
            {page.content.overview}
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {page.content.capabilities.map((capability) => (
              <article key={capability.title} className="rounded-xl border p-6">
                <h3 className="font-medium">{capability.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {capability.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="model-specifications" className="mt-20">
          <h2
            id="model-specifications"
            className="text-2xl font-semibold tracking-tight"
          >
            Model specifications
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[primary].map((model) => (
              <article
                key={`${model.modality}/${model.id}`}
                className="rounded-xl border bg-card p-6"
              >
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {model.modality}
                </p>
                <h3 className="mt-3 text-xl font-medium">{model.label}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {model.description}
                </p>
                <dl className="mt-6 grid gap-3 border-t pt-5 text-sm">
                  <div className="grid grid-cols-[7rem_1fr] gap-3">
                    <dt className="text-muted-foreground">Maker</dt>
                    <dd>{model.maker}</dd>
                  </div>
                  <div className="grid grid-cols-[7rem_1fr] gap-3">
                    <dt className="text-muted-foreground">Catalogue ID</dt>
                    <dd className="break-all font-mono text-xs">{model.id}</dd>
                  </div>
                  {model.facts.map((fact) => (
                    <div
                      key={fact.label}
                      className="grid grid-cols-[7rem_1fr] gap-3"
                    >
                      <dt className="text-muted-foreground">{fact.label}</dt>
                      <dd>{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="try-model"
          className="mt-20 rounded-2xl border bg-muted/20 p-8 md:p-10"
        >
          <h2 id="try-model" className="text-2xl font-semibold tracking-tight">
            Try {primary.label}
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            Open the Grida playground with this model selected. Generation uses
            your organization’s AI credit and asks you to sign in only when you
            run it.
          </p>
          <Button asChild className="mt-7">
            <Link href={page.demo.href}>Open {primary.label} playground</Link>
          </Button>
        </section>
      </div>
    </article>
  );
}

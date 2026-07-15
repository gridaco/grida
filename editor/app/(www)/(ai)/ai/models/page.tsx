import type { FC } from "react";
import type { Metadata } from "next";
import ai from "@/lib/ai";
import {
  models as textModels,
  catalog as textCatalog,
  type CatalogId,
  type ModelSpec,
  type ModelTier,
} from "@/lib/ai/models";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@app/ui/components/card";
import { Badge } from "@app/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@app/ui/components/table";
import { Separator } from "@app/ui/components/separator";
import type { ai as AITypes } from "@/lib/ai/ai";
import Header from "@/www/header";
import Footer from "@/www/footer";
import {
  BlackForestLabsLogo,
  OpenAILogo,
  AnthropicLogo,
  GoogleLogo,
} from "@grida/react-icons/logos";

export const metadata: Metadata = {
  title: "AI Models",
  description: "Explore the AI models available on Grida",
};

const Logos: Partial<Record<string, FC<{ className?: string }>>> = {
  "black-forest-labs": BlackForestLabsLogo,
  openai: OpenAILogo,
  anthropic: AnthropicLogo,
  google: GoogleLogo,
};

const LONG_CONTEXT_PRICING_NOTE =
  "For GPT-5.5 and GPT-5.6 Sol, Terra, and Luna, requests above 272K total input tokens use 2× input/cache rates and 1.5× output rates for the full request.";

// ── Helpers ─────────────────────────────────────────────────────────────────

function groupByVendor(
  models: Partial<Record<string, AITypes.image.ImageModelCard>>
) {
  const groups = new Map<string, AITypes.image.ImageModelCard[]>();
  for (const model of Object.values(models)) {
    if (!model) continue;
    const list = groups.get(model.vendor) ?? [];
    list.push(model);
    groups.set(model.vendor, list);
  }
  return groups;
}

const VendorLabels: Record<string, string> = {
  "black-forest-labs": "Black Forest Labs",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  "recraft-ai": "Recraft AI",
};

function vendorLabel(vendor: string) {
  return (
    VendorLabels[vendor] ??
    vendor
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

function groupAudioByVendor(
  models: Record<string, AITypes.audio.AudioModelCard>
) {
  const groups = new Map<string, AITypes.audio.AudioModelCard[]>();
  for (const model of Object.values(models)) {
    const list = groups.get(model.vendor) ?? [];
    list.push(model);
    groups.set(model.vendor, list);
  }
  return groups;
}

function dimLabel(model: AITypes.image.ImageModelCard) {
  if (model.sizes?.length) {
    return model.sizes.map(([w, h, r]) => `${w}x${h} (${r})`).join(", ");
  }
  if (model.constraints?.max_edge) {
    return `Up to ${model.constraints.max_edge}x${model.constraints.max_edge}`;
  }
  return "Flexible";
}

// ── Pricing components ──────────────────────────────────────────────────────

function PricingBadge({
  pricing,
}: {
  pricing: AITypes.image.ImageModelPricing;
}) {
  switch (pricing.type) {
    case "per_image_flat":
      return (
        <span className="font-mono text-sm">${pricing.usd.toFixed(3)}/img</span>
      );
    case "per_image_tiered": {
      const prices = Object.values(pricing.tiers);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return (
        <span className="font-mono text-sm">
          ${min.toFixed(3)}–${max.toFixed(3)}/img
        </span>
      );
    }
    case "per_token":
      return (
        <span className="font-mono text-sm">
          ${pricing.input.toFixed(2)}/${pricing.output.toFixed(2)} per 1M tok
        </span>
      );
  }
}

function TokenRates({ rates }: { rates: AITypes.image.PerTokenRates }) {
  const rows: [string, number][] = [["Text input", rates.input]];
  if (rates.cached_input !== undefined)
    rows.push(["Text input (cached)", rates.cached_input]);
  if (rates.image_input !== undefined)
    rows.push(["Image input", rates.image_input]);
  if (rates.cached_image_input !== undefined)
    rows.push(["Image input (cached)", rates.cached_image_input]);
  rows.push(["Output", rates.output]);
  return (
    <div className="space-y-0.5 text-xs">
      <p className="text-muted-foreground mb-1">Per 1M tokens</p>
      {rows.map(([label, price]) => (
        <div key={label} className="flex justify-between">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-mono text-foreground">${price.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function PricingDetail({
  pricing,
}: {
  pricing: AITypes.image.ImageModelPricing;
}) {
  switch (pricing.type) {
    case "per_image_flat":
      return (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-mono font-semibold tracking-tight">
            ${pricing.usd.toFixed(3)}
          </span>
          <span className="text-sm text-muted-foreground">per image</span>
        </div>
      );
    case "per_image_tiered": {
      const entries = Object.entries(pricing.tiers);
      const qualities = new Map<string, [string, number][]>();
      for (const [key, price] of entries) {
        const [quality, size] = key.split("/");
        const list = qualities.get(quality) ?? [];
        list.push([size, price]);
        qualities.set(quality, list);
      }
      return (
        <div className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20 px-0">Quality</TableHead>
                <TableHead className="px-0">Size</TableHead>
                <TableHead className="text-right px-0">Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...qualities.entries()].map(([quality, sizes]) =>
                sizes.map(([size, price], i) => (
                  <TableRow key={`${quality}/${size}`} className="border-0">
                    <TableCell className="py-1 px-0 capitalize text-muted-foreground">
                      {i === 0 ? quality : ""}
                    </TableCell>
                    <TableCell className="py-1 px-0 font-mono text-xs text-muted-foreground">
                      {size}
                    </TableCell>
                    <TableCell className="py-1 px-0 text-right font-mono">
                      ${price.toFixed(3)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {pricing.tokens && (
            <>
              <Separator />
              <TokenRates rates={pricing.tokens} />
            </>
          )}
        </div>
      );
    }
    case "per_token":
      return (
        <div className="space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-semibold tracking-tight">
              ${pricing.output.toFixed(2)}
            </span>
            <span className="text-sm text-muted-foreground">
              per 1M output tokens
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Input: ${pricing.input.toFixed(2)} / 1M tokens
          </p>
        </div>
      );
  }
}

function ConstraintsDetail({
  constraints,
}: {
  constraints: AITypes.image.ImageSizeConstraints;
}) {
  const rows: [string, string][] = [];
  if (constraints.max_edge !== undefined) {
    const min = constraints.min_edge ?? 0;
    rows.push([
      "Edge",
      min > 0
        ? `${min}–${constraints.max_edge} px`
        : `≤ ${constraints.max_edge} px`,
    ]);
  }
  if (constraints.step !== undefined) {
    rows.push(["Step", `multiples of ${constraints.step} px`]);
  }
  if (
    constraints.min_pixels !== undefined ||
    constraints.max_pixels !== undefined
  ) {
    const min = constraints.min_pixels?.toLocaleString() ?? "0";
    const max = constraints.max_pixels?.toLocaleString() ?? "—";
    rows.push(["Pixels", `${min}–${max}`]);
  }
  if (constraints.aspect_ratio?.max !== undefined) {
    rows.push(["Aspect ratio", `up to ${constraints.aspect_ratio.max}:1`]);
  }
  if (rows.length === 0) return null;
  return (
    <div className="space-y-0.5 text-xs">
      <p className="text-muted-foreground mb-1">Constraints</p>
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-mono text-foreground">{value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

function ModelCard({ model }: { model: AITypes.image.ImageModelCard }) {
  return (
    <Card className="flex flex-col bg-card/50 border-muted overflow-hidden">
      <CardHeader className="pb-3 h-20">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold">
            {model.label}
          </CardTitle>
          <Badge
            variant="outline"
            className="shrink-0 capitalize text-xs font-normal"
          >
            {model.speed_label} &middot; ~{model.speed_max}
          </Badge>
        </div>
        <CardDescription className="text-sm line-clamp-2 overflow-hidden text-ellipsis">
          {model.short_description}
        </CardDescription>
      </CardHeader>
      <Separator />
      <CardContent className="flex-1 flex flex-col gap-4 pt-4">
        {/* Pricing */}
        <PricingDetail pricing={model.pricing} />

        {/* Constraints */}
        {model.constraints && (
          <>
            <Separator />
            <ConstraintsDetail constraints={model.constraints} />
          </>
        )}

        {/* Specs */}
        <div className="mt-auto space-y-2 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Dimensions</span>
            <span className="font-mono text-foreground">
              {model.sizes?.length
                ? `${model.sizes.length} presets`
                : model.constraints?.max_edge
                  ? `up to ${model.constraints.max_edge}x${model.constraints.max_edge}`
                  : "Flexible"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Model ID</span>
            <code className="text-foreground">{model.id}</code>
          </div>
          {model.deprecated && (
            <div className="flex justify-between">
              <span>Status</span>
              <Badge variant="outline" className="text-xs h-4 font-normal">
                Deprecated
              </Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Text models ─────────────────────────────────────────────────────────────

function vendorOf(modelId: string): string {
  return modelId.includes("/") ? modelId.split("/")[0] : "openai";
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

function TextModelRow({ tier, spec }: { tier: ModelTier; spec: ModelSpec }) {
  const vendor = vendorOf(spec.id);
  const Logo = Logos[vendor];
  return (
    <TableRow>
      <TableCell>
        <Badge variant="secondary" className="capitalize font-mono text-xs">
          {tier}
        </Badge>
      </TableCell>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {Logo && <Logo className="size-4 shrink-0" />}
          <div>
            <div className="font-medium">{spec.label}</div>
            <code className="text-xs text-muted-foreground">{spec.id}</code>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell font-mono text-xs">
        {fmtTokens(spec.contextWindow)}
      </TableCell>
      <TableCell className="hidden md:table-cell font-mono text-xs">
        {fmtTokens(spec.outputLimit)}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        {fmtCost(spec.cost.input)}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        {fmtCost(spec.cost.cacheWrite)}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        {fmtCost(spec.cost.cacheRead)}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        {fmtCost(spec.cost.output)}
      </TableCell>
    </TableRow>
  );
}

const usdFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});

function fmtCost(value: number | undefined): string {
  return value === undefined ? "—" : `$${usdFormatter.format(value)}`;
}

function CatalogRow({ spec }: { spec: ModelSpec }) {
  const vendor = vendorOf(spec.id);
  const Logo = Logos[vendor];
  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {Logo && <Logo className="size-4 shrink-0" />}
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-medium">{spec.label}</span>
              {spec.deprecated && (
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 text-[10px] font-normal"
                >
                  Deprecated
                </Badge>
              )}
            </div>
            <code className="text-xs text-muted-foreground">{spec.id}</code>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        {fmtCost(spec.cost.input)}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        {fmtCost(spec.cost.cacheWrite)}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        {fmtCost(spec.cost.cacheRead)}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        {fmtCost(spec.cost.output)}
      </TableCell>
    </TableRow>
  );
}

function CatalogSection() {
  const entries = Object.entries(textCatalog) as [CatalogId, ModelSpec][];
  if (entries.length === 0) return null;
  return (
    <div className="container mx-auto px-4 pb-12">
      <div className="mb-4">
        <h3 className="text-lg font-semibold tracking-tight mb-1">
          All Models
        </h3>
        <p className="text-xs text-muted-foreground">
          Base rates per 1M tokens. {LONG_CONTEXT_PRICING_NOTE}
        </p>
      </div>
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-[260px]">Name</TableHead>
              <TableHead className="text-right">Input</TableHead>
              <TableHead className="text-right">Cache Write</TableHead>
              <TableHead className="text-right">Cache Read</TableHead>
              <TableHead className="text-right">Output</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(([id, spec]) => (
              <CatalogRow key={id} spec={spec} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function TextModelsSection() {
  const tiers = Object.entries(textModels) as [ModelTier, ModelSpec][];
  return (
    <>
      {/* Hero */}
      <div className="container px-4 pt-16 pb-10">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Agent Models</h1>
        <p className="text-base text-muted-foreground max-w-xl">
          Models powering agentic features in the editor — chat, code, tool use,
          and reasoning. Tiered models are included in the free budget;
          everything else is available metered at provider rates.
        </p>
      </div>

      {/* Tier table */}
      <div className="container mx-auto px-4 pb-12">
        <p className="text-xs text-muted-foreground mb-2">
          Cost columns are base rates in USD per 1M tokens.{" "}
          {LONG_CONTEXT_PRICING_NOTE}
        </p>
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-[100px]">Tier</TableHead>
                <TableHead className="w-[260px]">Model</TableHead>
                <TableHead className="hidden md:table-cell">Context</TableHead>
                <TableHead className="hidden md:table-cell">
                  Output limit
                </TableHead>
                <TableHead className="text-right">Input</TableHead>
                <TableHead className="text-right">Cache Write</TableHead>
                <TableHead className="text-right">Cache Read</TableHead>
                <TableHead className="text-right">Output</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tiers.map(([tier, spec]) => (
                <TextModelRow key={tier} tier={tier} spec={spec} />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AIModelsCatalogPage() {
  const grouped = groupByVendor(ai.image.models);

  return (
    <main className="min-h-screen">
      <Header className="relative top-0 z-50" />

      <TextModelsSection />

      <CatalogSection />

      <Separator />

      {/* Hero */}
      <div className="container px-4 pt-16 pb-10">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Image Models</h1>
        <p className="text-base text-muted-foreground max-w-xl">
          Image generation models available on Grida. Pricing is sourced
          directly from each provider.
        </p>
      </div>

      {/* Comparison table */}
      <div className="container mx-auto px-4 pb-12">
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-[260px]">Model</TableHead>
                <TableHead>Pricing</TableHead>
                <TableHead className="hidden md:table-cell">Speed</TableHead>
                <TableHead className="hidden lg:table-cell">
                  Dimensions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...grouped.entries()].map(([vendor, models]) => {
                const Logo = Logos[vendor];
                return models.map((model) => (
                  <TableRow key={model.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {Logo && <Logo className="size-4 shrink-0" />}
                        <div>
                          <div className="font-medium">{model.label}</div>
                          <code className="text-xs text-muted-foreground">
                            {model.id}
                          </code>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <PricingBadge pricing={model.pricing} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge
                        variant="outline"
                        className="capitalize font-normal text-xs"
                      >
                        {model.speed_label}
                      </Badge>
                      <span className="text-xs text-muted-foreground ml-2">
                        ~{model.speed_max}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {dimLabel(model)}
                    </TableCell>
                  </TableRow>
                ));
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <Separator />

      {/* Detail cards by vendor */}
      {[...grouped.entries()].map(([vendor, models]) => {
        const Logo = Logos[vendor];
        return (
          <section key={vendor} className="container mx-auto px-4 py-12">
            <div className="flex items-center gap-3 mb-6">
              {Logo && <Logo className="size-6" />}
              <h2 className="text-xl font-semibold">{vendorLabel(vendor)}</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {models.map((model) => (
                <ModelCard key={model.id} model={model} />
              ))}
            </div>
          </section>
        );
      })}

      <Separator />

      {/* Audio models hero */}
      <div className="container px-4 pt-16 pb-10">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Audio Models</h1>
        <p className="text-base text-muted-foreground max-w-xl">
          Music and audio generation models available on Grida. Pricing is
          sourced directly from each provider.
        </p>
      </div>

      {/* Audio comparison table */}
      <AudioModelsTable />

      <Separator />

      {/* Audio detail cards by vendor */}
      <AudioModelsCards />

      <div className="h-40" />
      <Footer />
    </main>
  );
}

// ── Audio models ────────────────────────────────────────────────────────────

function AudioPricingBadge({
  pricing,
}: {
  pricing: AITypes.audio.AudioModelPricing;
}) {
  return (
    <span className="font-mono text-sm">${pricing.usd.toFixed(3)}/run</span>
  );
}

function AudioPricingDetail({
  pricing,
}: {
  pricing: AITypes.audio.AudioModelPricing;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-mono font-semibold tracking-tight">
        ${pricing.usd.toFixed(3)}
      </span>
      <span className="text-sm text-muted-foreground">per generation</span>
    </div>
  );
}

function AudioModelCard({ model }: { model: AITypes.audio.AudioModelCard }) {
  return (
    <Card className="flex flex-col bg-card/50 border-muted overflow-hidden">
      <CardHeader className="pb-3 h-20">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold">
            {model.label}
          </CardTitle>
          <Badge
            variant="outline"
            className="shrink-0 capitalize text-xs font-normal"
          >
            {model.speed_label} &middot; ~{model.speed_max}
          </Badge>
        </div>
        <CardDescription className="text-sm line-clamp-2 overflow-hidden text-ellipsis">
          {model.short_description}
        </CardDescription>
      </CardHeader>
      <Separator />
      <CardContent className="flex-1 flex flex-col gap-4 pt-4">
        <AudioPricingDetail pricing={model.pricing} />

        <Separator />

        <div className="space-y-0.5 text-xs">
          <p className="text-muted-foreground mb-1">Output</p>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Duration</span>
            <span className="font-mono text-foreground">
              {model.duration_label}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Format</span>
            <span className="font-mono text-foreground uppercase">
              {model.output_format}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Audio</span>
            <span className="font-mono text-foreground">
              {model.sample_rate_label}
            </span>
          </div>
        </div>

        <div className="mt-auto space-y-2 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Provider</span>
            <span className="font-mono text-foreground capitalize">
              {model.provider}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Model ID</span>
            <code className="text-foreground">{model.id}</code>
          </div>
          {model.deprecated && (
            <div className="flex justify-between">
              <span>Status</span>
              <Badge variant="outline" className="text-xs h-4 font-normal">
                Deprecated
              </Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AudioModelsTable() {
  const grouped = groupAudioByVendor(ai.audio.models);
  return (
    <div className="container mx-auto px-4 pb-12">
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-[260px]">Model</TableHead>
              <TableHead>Pricing</TableHead>
              <TableHead className="hidden md:table-cell">Speed</TableHead>
              <TableHead className="hidden lg:table-cell">Output</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...grouped.entries()].map(([vendor, models]) => {
              const Logo = Logos[vendor];
              return models.map((model) => (
                <TableRow key={model.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {Logo && <Logo className="size-4 shrink-0" />}
                      <div>
                        <div className="font-medium">{model.label}</div>
                        <code className="text-xs text-muted-foreground">
                          {model.id}
                        </code>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <AudioPricingBadge pricing={model.pricing} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge
                      variant="outline"
                      className="capitalize font-normal text-xs"
                    >
                      {model.speed_label}
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-2">
                      ~{model.speed_max}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                    {model.duration_label} · {model.sample_rate_label}
                  </TableCell>
                </TableRow>
              ));
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AudioModelsCards() {
  const grouped = groupAudioByVendor(ai.audio.models);
  return (
    <>
      {[...grouped.entries()].map(([vendor, models]) => {
        const Logo = Logos[vendor];
        return (
          <section key={vendor} className="container mx-auto px-4 py-12">
            <div className="flex items-center gap-3 mb-6">
              {Logo && <Logo className="size-6" />}
              <h2 className="text-xl font-semibold">{vendorLabel(vendor)}</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {models.map((model) => (
                <AudioModelCard key={model.id} model={model} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

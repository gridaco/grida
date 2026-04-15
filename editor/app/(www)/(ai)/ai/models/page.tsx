import type { FC } from "react";
import { type Metadata } from "next";
import ai from "@/lib/ai";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import type { ai as AITypes } from "@/lib/ai/ai";
import Header from "@/www/header";
import Footer from "@/www/footer";
import { BlackForestLabsLogo } from "@/components/logos/blackforestlabs";
import { OpenAILogo } from "@/components/logos/openai";
import { AnthropicLogo } from "@/components/logos/anthropic";
import { Google as GoogleLogo } from "@/components/logos/google";

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

function dimLabel(model: AITypes.image.ImageModelCard) {
  if (model.sizes?.length) {
    return model.sizes.map(([w, h, r]) => `${w}x${h} (${r})`).join(", ");
  }
  if (model.max_width > 0) {
    return `Up to ${model.max_width}x${model.max_height}`;
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

        {/* Specs */}
        <div className="mt-auto space-y-2 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Dimensions</span>
            <span className="font-mono text-foreground">
              {model.sizes?.length
                ? `${model.sizes.length} presets`
                : model.max_width > 0
                  ? `up to ${model.max_width}x${model.max_height}`
                  : "Flexible"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Model ID</span>
            <code className="text-foreground">{model.id}</code>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AIModelsCatalogPage() {
  const grouped = groupByVendor(ai.image.models);

  return (
    <main className="min-h-screen">
      <Header className="relative top-0 z-50" />

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

      <div className="h-40" />
      <Footer />
    </main>
  );
}

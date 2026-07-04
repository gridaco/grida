"use client";
// GRIDA-GG: desktop — ensure a fresh GG token before generate (docs/wg/platform/hosted-ai.md)

import * as gridaGateway from "@/lib/desktop/gg-session";

import { useState } from "react";
import { Check, Download, Sparkles, SlidersHorizontal, X } from "lucide-react";
import { models } from "@grida/ai-models";
import { Skeleton } from "@app/ui/components/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@app/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@app/ui/components/dropdown-menu";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputController,
  type PromptInputMessage,
} from "@app/ui/ai-elements/prompt-input";
import { images } from "@/lib/desktop/bridge";
import { ImageModelPicker } from "./image-model-picker";

/** Named prompt templates — pick one from the composer menu to fill the input.
 *  Design-tool flavored starters; original to Grida. */
const PROMPT_TEMPLATES: { name: string; prompt: string }[] = [
  {
    name: "App Icon",
    prompt:
      "A modern app icon on a rounded squircle, bold simple glyph, soft gradient, subtle inner shadow, centered",
  },
  {
    name: "Product Hero Shot",
    prompt:
      "Clean studio product photo on a seamless pastel backdrop, soft shadows, crisp reflections, centered composition",
  },
  {
    name: "Gradient Wallpaper",
    prompt:
      "Smooth abstract mesh gradient wallpaper, soft blended colors, gentle grain, no text",
  },
  {
    name: "Isometric Workspace",
    prompt:
      "Cute isometric 3D illustration of a tidy desk workspace, pastel palette, soft lighting, miniature diorama",
  },
  {
    name: "Flat Vector Mascot",
    prompt:
      "Friendly flat-vector mascot character, bold outlines, limited palette, playful, on a plain background",
  },
  {
    name: "Hand-drawn Doodles",
    prompt:
      "A neat sheet of black-ink hand-drawn doodle icons, consistent line weight, on white paper",
  },
  {
    name: "Brand Pattern",
    prompt:
      "Seamless geometric brand pattern, two-color minimal shapes, evenly spaced, tileable",
  },
  {
    name: "Sticker Sheet",
    prompt:
      "A sheet of glossy die-cut stickers with white borders, vibrant cartoon style, drop shadows",
  },
];

const DEFAULT_MODEL_ID = models.image.listed_models()[0]?.id ?? "";

/** Always render at least this many cells so the gallery grid is visible even
 *  when empty. Extra slots beyond the images are blank placeholders. */
const MIN_CELLS = 20;

type SizeOption = { label: string; width?: number; height?: number };
const AUTO_SIZE: SizeOption = { label: "Auto" };
const QUALITY_OPTIONS = ["auto", "high", "medium", "low"] as const;

/** Size options for a model — 2K/4K only when its constraints allow. */
function sizeOptionsFor(
  card: models.image.ImageModelCard | undefined
): SizeOption[] {
  const maxEdge = card?.constraints?.max_edge;
  const opts: SizeOption[] = [
    AUTO_SIZE,
    { label: "Square (1024×1024)", width: 1024, height: 1024 },
    { label: "Portrait (1024×1536)", width: 1024, height: 1536 },
    { label: "Landscape (1536×1024)", width: 1536, height: 1024 },
  ];
  if (!maxEdge || maxEdge >= 2560)
    opts.push({ label: "2K (2560×1440)", width: 2560, height: 1440 });
  if (!maxEdge || maxEdge >= 3840)
    opts.push({ label: "4K (3840×2160)", width: 3840, height: 2160 });
  return opts;
}

/** Quality tiers only apply to per-image-tiered models (e.g. GPT Image). */
function supportsQuality(
  card: models.image.ImageModelCard | undefined
): boolean {
  return card?.pricing.type === "per_image_tiered";
}

/** File extension for a download, from the returned media type. */
function imageExtension(mediaType?: string): string {
  switch (mediaType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "png";
  }
}

type Tile = {
  id: string;
  prompt: string;
  model_id: string;
  status: "generating" | "done" | "error";
  src?: string;
  media_type?: string;
  error?: string;
};

/**
 * Desktop image generation playground (#908). A clean, full-bleed gallery: a
 * hairline grid that's always visible (even empty), a minimal header, and a
 * single floating prompt composer. Each submit prepends a shimmering cell that
 * fills in when its image resolves — one at a time. Generation runs in the
 * agent sidecar against the user's connected provider key; the key never
 * reaches this renderer (GRIDA-SEC-004).
 */
export function DesktopImagePlayground({
  initialModelId,
}: {
  initialModelId?: string;
} = {}) {
  const [modelId, setModelId] = useState(
    initialModelId && models.image.models[initialModelId]?.listed
      ? initialModelId
      : DEFAULT_MODEL_ID
  );
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [size, setSize] = useState<SizeOption>(AUTO_SIZE);
  const [quality, setQuality] = useState<string>("auto");

  const card = models.image.models[modelId];
  const active = tiles.find((t) => t.id === activeId && t.status === "done");

  const remove = (id: string) =>
    setTiles((prev) => prev.filter((t) => t.id !== id));

  const onSubmit = (message: PromptInputMessage) => {
    void runGenerate(message.text);
  };

  const runGenerate = async (rawPrompt: string) => {
    // GRIDA-SEC-006 — keep the sidecar's hosted-AI session fresh so a
    // signed-in keyless user generates through the included provider.
    // Never throws; BYOK runs are unaffected when it degrades.
    await gridaGateway.ensureFresh();
    const prompt = rawPrompt.trim();
    if (!prompt) return;
    const id = crypto.randomUUID();
    const model_id = modelId;
    setTiles((prev) => [
      { id, prompt, model_id, status: "generating" },
      ...prev,
    ]);
    try {
      const res = await images.generate({
        model_id,
        prompt,
        ...(size.width && size.height
          ? { width: size.width, height: size.height }
          : {}),
        ...(quality !== "auto" ? { quality } : {}),
      });
      const first = res.images[0];
      const src = first
        ? `data:${first.media_type};base64,${first.base64}`
        : undefined;
      setTiles((prev) =>
        prev.map((t) =>
          t.id === id
            ? src
              ? { ...t, status: "done", src, media_type: first?.media_type }
              : { ...t, status: "error", error: "No image returned" }
            : t
        )
      );
    } catch (e) {
      setTiles((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, status: "error", error: String(e) } : t
        )
      );
    }
  };

  const cellCount = Math.max(MIN_CELLS, Math.ceil(tiles.length / 5) * 5);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between px-6 py-4">
        <h1 className="text-2xl font-bold tracking-tight">Images</h1>
      </header>

      {/* Gallery — a real hairline grid, visible even when empty. Cells are
          transparent; the borders (cell right/bottom + grid left/top) draw a
          single crisp line everywhere. */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-40">
        <div className="grid grid-cols-2 border-l border-t border-border sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: cellCount }, (_, i) => {
            const tile = tiles[i];
            return tile ? (
              <GalleryCell
                key={tile.id}
                tile={tile}
                onOpen={() => setActiveId(tile.id)}
                onRemove={() => remove(tile.id)}
              />
            ) : (
              <div
                key={`empty-${i}`}
                className="aspect-square border-b border-r border-border"
              />
            );
          })}
        </div>
      </div>

      {/* Floating composer — a single pill. The pill IS the InputGroup
          (PromptInput's child div); we style it directly via `[&>div]` so its
          focus ring renders unclipped (no `overflow-hidden` ancestor). */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
        {/* Provider lifts the text state so the template menu can fill it. */}
        <PromptInputProvider>
          <PromptInput
            onSubmit={onSubmit}
            className="pointer-events-auto w-full max-w-2xl [&>div]:rounded-2xl [&>div]:bg-background/90 [&>div]:shadow-lg [&>div]:backdrop-blur"
          >
            <PromptInputBody>
              <PromptInputTextarea placeholder="Describe what you want to see…" />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <TemplateMenu />
                <SettingsMenu
                  card={card}
                  size={size}
                  onSize={setSize}
                  quality={quality}
                  onQuality={setQuality}
                />
                <ImageModelPicker
                  value={modelId}
                  onValueChange={(next) => {
                    // Reset model-scoped options — a size/quality the new model
                    // doesn't expose would otherwise be sent and rejected.
                    setModelId(next);
                    setSize(AUTO_SIZE);
                    setQuality("auto");
                  }}
                />
              </PromptInputTools>
              <PromptInputSubmit />
            </PromptInputFooter>
          </PromptInput>
        </PromptInputProvider>
      </div>

      {/* Fullscreen viewer */}
      <Dialog
        open={active != null}
        onOpenChange={(o) => !o && setActiveId(null)}
      >
        <DialogContent className="max-w-[90vw] overflow-hidden p-0 sm:max-w-3xl">
          <DialogTitle className="sr-only">
            {active?.prompt ?? "Generated image"}
          </DialogTitle>
          {active?.src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={active.src}
              alt={active.prompt}
              className="max-h-[85vh] w-full object-contain"
            />
          )}
          {active && (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              {active.prompt}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Composer toolbar menu of named prompt templates. Clicking one fills the
 *  input (does not generate) via the lifted PromptInput controller. */
function TemplateMenu() {
  const { textInput } = usePromptInputController();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PromptInputButton
          aria-label="Prompt templates"
          title="Prompt templates"
        >
          <Sparkles className="size-4" />
        </PromptInputButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className="max-h-80 overflow-y-auto"
      >
        {PROMPT_TEMPLATES.map((t) => (
          <DropdownMenuItem
            key={t.name}
            onSelect={() => textInput.setInput(t.prompt)}
          >
            {t.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Composer toolbar menu of model-aware generation controls (size + quality). */
function SettingsMenu({
  card,
  size,
  onSize,
  quality,
  onQuality,
}: {
  card: models.image.ImageModelCard | undefined;
  size: SizeOption;
  onSize: (s: SizeOption) => void;
  quality: string;
  onQuality: (q: string) => void;
}) {
  const sizeOptions = sizeOptionsFor(card);
  const showQuality = supportsQuality(card);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PromptInputButton aria-label="Image settings" title="Image settings">
          <SlidersHorizontal className="size-4" />
        </PromptInputButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className="max-h-96 w-56 overflow-y-auto"
      >
        <DropdownMenuLabel>Size</DropdownMenuLabel>
        {sizeOptions.map((opt) => (
          <DropdownMenuItem
            key={opt.label}
            onSelect={() => onSize(opt)}
            className="justify-between"
          >
            {opt.label}
            {opt.label === size.label && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
        {showQuality && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Quality</DropdownMenuLabel>
            {QUALITY_OPTIONS.map((q) => (
              <DropdownMenuItem
                key={q}
                onSelect={() => onQuality(q)}
                className="justify-between capitalize"
              >
                {q}
                {q === quality && <Check className="size-4" />}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const CELL = "relative aspect-square border-b border-r border-border";
const CELL_BTN =
  "flex size-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80";

function GalleryCell({
  tile,
  onOpen,
  onRemove,
}: {
  tile: Tile;
  onOpen: () => void;
  onRemove: () => void;
}) {
  if (tile.status === "generating") {
    return (
      <div className={`${CELL} overflow-hidden`}>
        <Skeleton className="size-full rounded-none" />
        {/* Show the prompt while generating so the user knows what's coming. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3">
          <p className="line-clamp-4 text-center text-xs text-muted-foreground">
            {tile.prompt}
          </p>
        </div>
      </div>
    );
  }

  if (tile.status === "error") {
    return (
      <div
        className={`group flex flex-col items-center justify-center gap-1 bg-destructive/5 p-3 text-center text-destructive ${CELL}`}
      >
        <span className="text-xs font-medium">Failed to generate</span>
        <span
          className="line-clamp-4 text-[11px] leading-tight opacity-80"
          title={tile.error}
        >
          {tile.error}
        </span>
        <button
          type="button"
          aria-label="Dismiss"
          title="Dismiss"
          onClick={onRemove}
          className={`${CELL_BTN} absolute right-1 top-1 opacity-0 group-hover:opacity-100`}
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className={`group overflow-hidden ${CELL}`}>
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label="Open image"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={tile.src}
          alt={tile.prompt}
          className="size-full object-cover transition duration-200 group-hover:scale-[1.02]"
        />
      </button>

      {/* Hover: prompt overlay (non-interactive) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
        <p className="line-clamp-2 text-xs text-white">{tile.prompt}</p>
      </div>

      {/* Hover: actions (siblings of the open button, on top) */}
      <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
        <a
          href={tile.src}
          download={`grida-image-${tile.id}.${imageExtension(tile.media_type)}`}
          onClick={(e) => e.stopPropagation()}
          aria-label="Download"
          title="Download"
          className={CELL_BTN}
        >
          <Download className="size-3.5" />
        </a>
        <button
          type="button"
          aria-label="Remove"
          title="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={CELL_BTN}
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

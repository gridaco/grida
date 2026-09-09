"use client";
// GRIDA-GG: desktop — ensure a fresh GG token before generate (docs/wg/platform/hosted-ai.md)

import * as gridaGateway from "@/lib/desktop/gg-session";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Check, Download, Sparkles, SlidersHorizontal, X } from "lucide-react";
import { catalog as models } from "@app/ai-catalog";
import { Skeleton } from "@app/ui/components/skeleton";
import { cn } from "@app/ui/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
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
import { images, useDesktopBridge, type MediaItem } from "@/lib/desktop/bridge";
import { ImageModelPicker } from "./image-model-picker";
import { GeneratedImagePreview } from "./generated-image-preview";
import { MediaModelAvailability } from "../shared/media-model-availability";
import { Transparency } from "@/grida-canvas-react/components/transparency";

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

/** Explicit quality options can also belong to token-billed image models. */
function qualityOptionsFor(
  card: models.image.ImageModelCard | undefined
): readonly string[] {
  return (
    card?.quality?.options ??
    (card?.pricing.type === "per_image_tiered" ? QUALITY_OPTIONS : [])
  );
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
  showGridLeftBorder = true,
  onGenerationBusyChange,
  onStoredMediaCreated,
}: {
  initialModelId?: string;
  showGridLeftBorder?: boolean;
  onGenerationBusyChange?: (busy: boolean) => void;
  onStoredMediaCreated?: (item: MediaItem) => void;
} = {}) {
  const bridge = useDesktopBridge();
  const providerStore = useMemo(
    () =>
      new MediaModelAvailability.ImageProviders(
        bridge,
        async () => (await gridaGateway.ensureFresh()).kind === "active"
      ),
    [bridge]
  );
  const providers = useSyncExternalStore(
    providerStore.subscribe,
    providerStore.getSnapshot,
    providerStore.getSnapshot
  );
  useEffect(() => providerStore.connect(), [providerStore]);
  const [modelId, setModelId] = useState(
    () =>
      MediaModelAvailability.select(
        models.image.listed_models(),
        initialModelId,
        models.image.default_id
      )?.id ?? ""
  );
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [size, setSize] = useState<SizeOption>(AUTO_SIZE);
  const card = models.image.models[modelId];
  const [transparent, setTransparent] = useState(false);
  const access = MediaModelAvailability.image(card, providers, transparent);
  const transparencyAccess = MediaModelAvailability.image(
    card,
    providers,
    true
  );
  const [quality, setQuality] = useState<string>(
    () => card?.quality?.default ?? "auto"
  );
  const active = tiles.find((t) => t.id === activeId && t.status === "done");

  const remove = (id: string) =>
    setTiles((prev) => prev.filter((t) => t.id !== id));

  const onSubmit = (message: PromptInputMessage) => {
    void runGenerate(message.text);
  };

  const runGenerate = async (rawPrompt: string) => {
    const prompt = rawPrompt.trim();
    if (!prompt) return;
    // GRIDA-SEC-006 — refresh hosted-session readiness and key presence before
    // submission. A removed key never silently turns transparent intent opaque.
    const refreshed = await providerStore.refresh(card, transparent);
    if (!MediaModelAvailability.image(card, refreshed, transparent).available)
      return;
    const id = crypto.randomUUID();
    const model_id = modelId;
    setTiles((prev) => [
      { id, prompt, model_id, status: "generating" },
      ...prev,
    ]);
    onGenerationBusyChange?.(true);
    try {
      const res = await images.generate({
        model_id,
        prompt,
        ...(size.width && size.height
          ? { width: size.width, height: size.height }
          : {}),
        ...(card?.quality || quality !== "auto" ? { quality } : {}),
        ...(transparent ? { background: "transparent" as const } : {}),
      });
      for (let index = res.images.length - 1; index >= 0; index -= 1) {
        const stored = res.images[index]?.stored_media;
        if (stored) onStoredMediaCreated?.(stored);
      }
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
    } finally {
      onGenerationBusyChange?.(false);
    }
  };

  const cellCount = Math.max(MIN_CELLS, Math.ceil(tiles.length / 5) * 5);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between px-6 py-4">
        <h1 className="text-2xl font-bold tracking-tight">Images</h1>
        {!access.available && (
          <p role="status" className="text-sm text-muted-foreground">
            {access.reason}
          </p>
        )}
      </header>

      {/* Gallery — a real hairline grid, visible even when empty. Cells are
          transparent; the borders (cell right/bottom + grid left/top) draw a
          single crisp line everywhere. The left edge is optional when a parent
          surface already owns that shared boundary. */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-40">
        <div
          className={cn(
            "grid grid-cols-2 border-t border-border sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
            showGridLeftBorder && "border-l"
          )}
        >
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
                  transparent={transparent}
                  onTransparent={setTransparent}
                  transparencyAvailable={transparencyAccess.available}
                />
                <ImageModelPicker
                  value={modelId}
                  providers={providers}
                  onValueChange={(next) => {
                    // Reset model-scoped options — a size/quality the new model
                    // doesn't expose would otherwise be sent and rejected.
                    setModelId(next);
                    setSize(AUTO_SIZE);
                    setTransparent(false);
                    setQuality(
                      models.image.models[next]?.quality?.default ?? "auto"
                    );
                  }}
                />
              </PromptInputTools>
              <PromptInputSubmit disabled={!access.available} />
            </PromptInputFooter>
          </PromptInput>
        </PromptInputProvider>
      </div>

      {/* Fullscreen viewer */}
      <GeneratedImagePreview
        key={active?.id}
        open={active != null}
        onOpenChange={(o) => !o && setActiveId(null)}
        src={active?.src}
        prompt={active?.prompt ?? ""}
      />
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
  transparent,
  onTransparent,
  transparencyAvailable,
}: {
  card: models.image.ImageModelCard | undefined;
  size: SizeOption;
  onSize: (s: SizeOption) => void;
  quality: string;
  onQuality: (q: string) => void;
  transparent: boolean;
  onTransparent: (value: boolean) => void;
  transparencyAvailable: boolean;
}) {
  const sizeOptions = sizeOptionsFor(card);
  const qualityOptions = qualityOptionsFor(card);
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
        {qualityOptions.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Quality</DropdownMenuLabel>
            {qualityOptions.map((q) => (
              <DropdownMenuItem
                key={q}
                onSelect={() => onQuality(q)}
                className="justify-between capitalize"
              >
                {q === "xhigh" ? "Extra high" : q === "max" ? "Maximum" : q}
                {q === quality && <Check className="size-4" />}
              </DropdownMenuItem>
            ))}
          </>
        )}
        {/* Preserve checked intent after disconnect (see test/desktop-media-transparent-background.md). */}
        {(transparencyAvailable || transparent) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={transparent}
              onCheckedChange={onTransparent}
            >
              Transparent background
            </DropdownMenuCheckboxItem>
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
    <Transparency className={`group overflow-hidden ${CELL}`}>
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
    </Transparency>
  );
}

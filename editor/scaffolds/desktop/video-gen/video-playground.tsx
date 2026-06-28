"use client";

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
import { video } from "@/lib/desktop/bridge";
import { VideoModelPicker } from "./video-model-picker";

/** Named prompt templates — motion-flavored starters, original to Grida. */
const PROMPT_TEMPLATES: { name: string; prompt: string }[] = [
  {
    name: "Product Spin",
    prompt:
      "A sleek product rotating slowly on a seamless studio backdrop, soft cinematic lighting, shallow depth of field",
  },
  {
    name: "Drone Flyover",
    prompt:
      "Aerial drone shot flying over a misty mountain range at golden hour, smooth forward motion, cinematic",
  },
  {
    name: "Liquid Macro",
    prompt:
      "Extreme macro of colorful ink swirling in water, slow motion, soft light, abstract and mesmerizing",
  },
  {
    name: "City Timelapse",
    prompt:
      "Timelapse of a city skyline transitioning from day to night, streaking car lights, clouds drifting",
  },
  {
    name: "Character Walk",
    prompt:
      "A stylized cartoon mascot walking toward camera on a plain background, looping, playful, smooth motion",
  },
  {
    name: "Nature Loop",
    prompt:
      "Seamless looping shot of tall grass swaying gently in the breeze, warm sunlight, calm and serene",
  },
];

const DEFAULT_MODEL_ID = models.video.listed_models()[0]?.id ?? "";

/** Always render at least this many cells so the gallery grid is visible. */
const MIN_CELLS = 12;

const AUTO = "Auto";

/** Duration options bounded by the model's min/max (seconds). */
function durationOptionsFor(
  card: models.video.VideoModelCard | undefined
): { label: string; value?: number }[] {
  const opts: { label: string; value?: number }[] = [{ label: AUTO }];
  if (!card) return opts;
  const seen = new Set<number>();
  for (const v of [
    card.min_duration,
    card.default.duration,
    card.max_duration,
  ]) {
    if (v != null && !seen.has(v)) {
      seen.add(v);
      opts.push({ label: `${v}s`, value: v });
    }
  }
  return opts;
}

/** File extension for a download, from the returned media type. */
function videoExtension(mediaType?: string): string {
  switch (mediaType) {
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    default:
      return "mp4";
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
 * Desktop video generation playground (#908) — the video sibling of the image
 * playground. A hairline gallery (visible even empty), a minimal header, and a
 * floating prompt composer. Each submit prepends a shimmering cell that fills in
 * with a playable clip when the video resolves. Generation runs in the agent
 * sidecar against the user's connected provider key; the key never reaches this
 * renderer (GRIDA-SEC-004). v1 is text-to-video (served by a connected Vercel
 * key for every listed model).
 */
export function DesktopVideoPlayground({
  initialModelId,
}: {
  initialModelId?: string;
} = {}) {
  const [modelId, setModelId] = useState(
    initialModelId && models.video.models[initialModelId]?.listed
      ? initialModelId
      : DEFAULT_MODEL_ID
  );
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [aspect, setAspect] = useState<string>(AUTO);
  const [duration, setDuration] = useState<{ label: string; value?: number }>({
    label: AUTO,
  });

  const card = models.video.models[modelId];
  const active = tiles.find((t) => t.id === activeId && t.status === "done");

  const remove = (id: string) =>
    setTiles((prev) => prev.filter((t) => t.id !== id));

  const onSubmit = (message: PromptInputMessage) => {
    void runGenerate(message.text);
  };

  const runGenerate = async (rawPrompt: string) => {
    const prompt = rawPrompt.trim();
    if (!prompt) return;
    const id = crypto.randomUUID();
    const model_id = modelId;
    setTiles((prev) => [
      { id, prompt, model_id, status: "generating" },
      ...prev,
    ]);
    try {
      const res = await video.generate({
        model_id,
        prompt,
        ...(aspect !== AUTO ? { aspect_ratio: aspect } : {}),
        ...(duration.value != null ? { duration: duration.value } : {}),
      });
      const first = res.videos[0];
      const src = first
        ? `data:${first.media_type};base64,${first.base64}`
        : undefined;
      setTiles((prev) =>
        prev.map((t) =>
          t.id === id
            ? src
              ? { ...t, status: "done", src, media_type: first?.media_type }
              : { ...t, status: "error", error: "No video returned" }
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

  const cellCount = Math.max(MIN_CELLS, Math.ceil(tiles.length / 4) * 4);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between px-6 py-4">
        <h1 className="text-2xl font-bold tracking-tight">Video</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-40">
        <div className="grid grid-cols-1 border-l border-t border-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                className="aspect-video border-b border-r border-border"
              />
            );
          })}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
        <PromptInputProvider>
          <PromptInput
            onSubmit={onSubmit}
            className="pointer-events-auto w-full max-w-2xl [&>div]:rounded-2xl [&>div]:bg-background/90 [&>div]:shadow-lg [&>div]:backdrop-blur"
          >
            <PromptInputBody>
              <PromptInputTextarea placeholder="Describe the video you want to create…" />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <TemplateMenu />
                <SettingsMenu
                  card={card}
                  aspect={aspect}
                  onAspect={setAspect}
                  duration={duration}
                  onDuration={setDuration}
                />
                <VideoModelPicker
                  value={modelId}
                  onValueChange={(next) => {
                    // Model-scoped options don't carry over — a stale aspect
                    // ratio / duration the new model doesn't offer would fail.
                    setModelId(next);
                    setAspect(AUTO);
                    setDuration({ label: AUTO });
                  }}
                />
              </PromptInputTools>
              <PromptInputSubmit />
            </PromptInputFooter>
          </PromptInput>
        </PromptInputProvider>
      </div>

      <Dialog
        open={active != null}
        onOpenChange={(o) => !o && setActiveId(null)}
      >
        <DialogContent className="max-w-[90vw] overflow-hidden p-0 sm:max-w-3xl">
          <DialogTitle className="sr-only">
            {active?.prompt ?? "Generated video"}
          </DialogTitle>
          {active?.src && (
            <video
              src={active.src}
              controls
              autoPlay
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

/** Model-aware generation controls (aspect ratio + duration). */
function SettingsMenu({
  card,
  aspect,
  onAspect,
  duration,
  onDuration,
}: {
  card: models.video.VideoModelCard | undefined;
  aspect: string;
  onAspect: (a: string) => void;
  duration: { label: string; value?: number };
  onDuration: (d: { label: string; value?: number }) => void;
}) {
  const aspectOptions = [AUTO, ...(card?.aspect_ratios ?? [])];
  const durationOptions = durationOptionsFor(card);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PromptInputButton aria-label="Video settings" title="Video settings">
          <SlidersHorizontal className="size-4" />
        </PromptInputButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className="max-h-96 w-56 overflow-y-auto"
      >
        <DropdownMenuLabel>Aspect ratio</DropdownMenuLabel>
        {aspectOptions.map((opt) => (
          <DropdownMenuItem
            key={opt}
            onSelect={() => onAspect(opt)}
            className="justify-between"
          >
            {opt}
            {opt === aspect && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Duration</DropdownMenuLabel>
        {durationOptions.map((opt) => (
          <DropdownMenuItem
            key={opt.label}
            onSelect={() => onDuration(opt)}
            className="justify-between"
          >
            {opt.label}
            {opt.label === duration.label && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const CELL = "relative aspect-video border-b border-r border-border";
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
        aria-label="Open video"
      >
        <video
          src={tile.src}
          muted
          loop
          playsInline
          className="size-full object-cover transition duration-200 group-hover:scale-[1.02]"
          onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
          onMouseLeave={(e) => e.currentTarget.pause()}
        />
      </button>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
        <p className="line-clamp-2 text-xs text-white">{tile.prompt}</p>
      </div>

      <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
        <a
          href={tile.src}
          download={`grida-video-${tile.id}.${videoExtension(tile.media_type)}`}
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

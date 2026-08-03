"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  Box,
  Download,
  FileUp,
  FolderSearch,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import { models } from "@grida/ai-models";
import { Badge } from "@app/ui/components/badge";
import { Button } from "@app/ui/components/button";
import { cn } from "@app/ui/lib/utils";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@app/ui/components/empty";
import Link from "next/link";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@app/ui/components/tabs";
import { AudioCompatibility } from "./audio-compatibility";
import { LocalAudioPlayer } from "./local-audio-player";
import { LocalGltfBundle } from "./local-gltf-bundle";
import { LocalGltfPreview } from "./local-gltf-preview";
import type { LocalGltfPreviewController } from "./local-gltf-preview-controller";
import {
  AudioGenerationControls,
  ThreeDGenerationControls,
  type GeneratedPreview,
  type ThreeDGenerationInputMode,
} from "./generation-controls";
import type { MediaModelHandoff } from "./media-model-handoff";
import type { MediaItem } from "@/lib/desktop/bridge";
import { DesktopMediaTool } from "../tools/media-tool-registry";

const THREE_D_MODELS = models.three_d.staged_models();
const MUSIC_MODELS = models.audio.music_models();
const SOUND_EFFECT_MODELS = models.audio.sound_effect_models();

const GLTF_BUNDLE_ACCEPT = [
  LocalGltfBundle.ACCEPT,
  ".bin,.png,.jpg,.jpeg,.webp,.avif,image/png,image/jpeg,image/webp,image/avif",
].join(",");

export type MediaFormatsPlaygroundMode = "3d" | "audio" | "models";

export type MediaFormatsStoredPreview = Readonly<{
  item: MediaItem;
  file: File;
  mode: "3d" | "audio";
}>;

/**
 * Desktop media-format compatibility and generation playground.
 *
 * The viewer tabs deliberately follow the Desktop workbench lifecycle: their
 * subtrees stay mounted across tab switches, while playback and animation are
 * suspended through the viewers' active contract. Provider calls stay behind
 * the optional Desktop bridge and successful byte results re-enter through the
 * exact same local `File` viewer boundary as user-opened assets.
 */
export function DesktopMediaFormatsPlayground({
  initialHandoff = null,
  initialMode = "3d",
  title = "Media formats",
  badgeLabel = "Playground",
  headingLevel = 1,
  showModeTabs = true,
  showGeneration = true,
  generationDisabled = false,
  threeDModelIds,
  audioModelIds,
  onGenerationBusyChange,
  initialStoredMedia,
  onStoredMediaCreated,
  onRevealStoredMedia,
}: {
  initialHandoff?: MediaModelHandoff | null;
  initialMode?: MediaFormatsPlaygroundMode;
  title?: string;
  badgeLabel?: string | null;
  headingLevel?: 1 | 2;
  showModeTabs?: boolean;
  showGeneration?: boolean;
  generationDisabled?: boolean;
  threeDModelIds?: readonly models.three_d.ThreeDModelId[];
  audioModelIds?: readonly models.audio.AudioModelId[];
  onGenerationBusyChange?: (busy: boolean) => void;
  initialStoredMedia?: MediaFormatsStoredPreview | null;
  onStoredMediaCreated?: (item: MediaItem) => void;
  onRevealStoredMedia?: (item: MediaItem) => void;
} = {}) {
  const [mode, setMode] = useState<MediaFormatsPlaygroundMode>(
    initialStoredMedia?.mode ?? initialHandoff?.mode ?? initialMode
  );
  const initialThreeDInputMode: ThreeDGenerationInputMode =
    initialHandoff?.mode === "3d"
      ? models.three_d.models[initialHandoff.modelId].input.type
      : (threeDModelIds ?? models.three_d.three_d_model_ids).some(
            (id) => models.three_d.models[id].input.type === "text"
          )
        ? "text"
        : "image";
  const [threeDInputMode, setThreeDInputMode] =
    useState<ThreeDGenerationInputMode>(initialThreeDInputMode);
  const [threeDFiles, setThreeDFiles] = useState<readonly File[]>(
    initialStoredMedia?.mode === "3d" ? [initialStoredMedia.file] : []
  );
  const [threeDSource, setThreeDSource] = useState<
    "local" | "generated" | "stored" | null
  >(initialStoredMedia?.mode === "3d" ? "stored" : null);
  const [threeDStoredMedia, setThreeDStoredMedia] = useState<MediaItem | null>(
    initialStoredMedia?.mode === "3d" ? initialStoredMedia.item : null
  );
  const [threeDStatus, setThreeDStatus] =
    useState<LocalGltfPreviewController.Status>({ phase: "idle" });
  const [audioFile, setAudioFile] = useState<File | null>(
    initialStoredMedia?.mode === "audio" ? initialStoredMedia.file : null
  );
  const [audioSource, setAudioSource] = useState<
    "local" | "generated" | "stored" | null
  >(initialStoredMedia?.mode === "audio" ? "stored" : null);
  const [audioStoredMedia, setAudioStoredMedia] = useState<MediaItem | null>(
    initialStoredMedia?.mode === "audio" ? initialStoredMedia.item : null
  );
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const threeDInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const onThreeDFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length === 0) return;
    setThreeDFiles(files);
    setThreeDSource("local");
    setThreeDStoredMedia(null);
    setThreeDStatus({ phase: "idle" });
  };

  const onAudioFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    setAudioFile(file);
    setAudioSource("local");
    setAudioStoredMedia(null);
    setAudioDuration(null);
  };

  const onThreeDGenerated = (result: GeneratedPreview) => {
    setThreeDFiles([result.file]);
    setThreeDSource("generated");
    setThreeDStoredMedia(result.storedMedia ?? null);
    setThreeDStatus({ phase: "idle" });
    if (result.storedMedia) onStoredMediaCreated?.(result.storedMedia);
  };

  const onAudioGenerated = (result: GeneratedPreview) => {
    setAudioFile(result.file);
    setAudioSource("generated");
    setAudioStoredMedia(result.storedMedia ?? null);
    setAudioDuration(null);
    if (result.storedMedia) onStoredMediaCreated?.(result.storedMedia);
  };

  const clearThreeD = () => {
    setThreeDFiles([]);
    setThreeDSource(null);
    setThreeDStoredMedia(null);
    setThreeDStatus({ phase: "idle" });
  };

  const clearAudio = () => {
    setAudioFile(null);
    setAudioSource(null);
    setAudioStoredMedia(null);
    setAudioDuration(null);
  };

  const audioSupport = audioFile ? AudioCompatibility.probe(audioFile) : null;
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const availableThreeDModelIds =
    threeDModelIds ?? models.three_d.three_d_model_ids;
  const hasTextToThreeD = availableThreeDModelIds.some(
    (id) => models.three_d.models[id].input.type === "text"
  );
  const hasImageToThreeD = availableThreeDModelIds.some(
    (id) => models.three_d.models[id].input.type === "image"
  );

  const toolbar = (
    <header className="flex shrink-0 flex-wrap items-center gap-3 px-6 py-4">
      <div className="mr-2 min-w-0">
        <div className="flex items-center gap-2">
          <Heading className="text-2xl font-bold tracking-tight">
            {title}
          </Heading>
          {badgeLabel && <Badge variant="outline">{badgeLabel}</Badge>}
        </div>
      </div>

      {showModeTabs && (
        <TabsList variant="line">
          <TabsTrigger value="3d">
            <Box aria-hidden />
            3D
          </TabsTrigger>
          <TabsTrigger value="audio">
            <Volume2 aria-hidden />
            Audio
          </TabsTrigger>
          <TabsTrigger value="models">
            <Sparkles aria-hidden />
            Models
          </TabsTrigger>
        </TabsList>
      )}

      {mode === "3d" &&
        showGeneration &&
        hasTextToThreeD &&
        hasImageToThreeD && (
          <Tabs
            value={threeDInputMode}
            onValueChange={(value) =>
              setThreeDInputMode(value as ThreeDGenerationInputMode)
            }
            className="block"
          >
            <TabsList>
              <TabsTrigger value="text" disabled={generationDisabled}>
                Text to 3D
              </TabsTrigger>
              <TabsTrigger value="image" disabled={generationDisabled}>
                Image to 3D
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

      <div className="ml-auto flex items-center gap-2">
        {mode === "3d" && (
          <>
            {threeDSource !== "local" && threeDFiles[0] && (
              <DownloadFileButton file={threeDFiles[0]} />
            )}
            {threeDStoredMedia && onRevealStoredMedia && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRevealStoredMedia(threeDStoredMedia)}
              >
                <FolderSearch aria-hidden />
                Show in folder
              </Button>
            )}
            {threeDFiles.length > 0 && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => threeDInputRef.current?.click()}
                >
                  <FileUp aria-hidden />
                  Replace
                </Button>
                <Button size="sm" variant="ghost" onClick={clearThreeD}>
                  <X aria-hidden />
                  Clear
                </Button>
              </>
            )}
          </>
        )}
        {mode === "audio" && (
          <>
            {audioSource !== "local" && audioFile && (
              <DownloadFileButton file={audioFile} />
            )}
            {audioStoredMedia && onRevealStoredMedia && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRevealStoredMedia(audioStoredMedia)}
              >
                <FolderSearch aria-hidden />
                Show in folder
              </Button>
            )}
            {audioFile && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => audioInputRef.current?.click()}
                >
                  <FileUp aria-hidden />
                  Replace
                </Button>
                <Button size="sm" variant="ghost" onClick={clearAudio}>
                  <X aria-hidden />
                  Clear
                </Button>
              </>
            )}
          </>
        )}
        {mode === "models" && (
          <Badge variant="secondary">Catalogue + handoff</Badge>
        )}
      </div>
    </header>
  );

  const threeDInput = (
    <input
      ref={threeDInputRef}
      id="media-formats-3d-files"
      className="sr-only"
      tabIndex={-1}
      type="file"
      accept={GLTF_BUNDLE_ACCEPT}
      multiple
      aria-describedby="media-formats-3d-help"
      onChange={onThreeDFilesChange}
    />
  );
  const audioInput = (
    <input
      ref={audioInputRef}
      id="media-formats-audio-file"
      className="sr-only"
      tabIndex={-1}
      type="file"
      accept={AudioCompatibility.ACCEPT}
      aria-describedby="media-formats-audio-help"
      onChange={onAudioFileChange}
    />
  );

  const threeDPanel = (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className={cn("min-h-0 flex-1 p-4", showGeneration && "pb-40")}>
        {threeDFiles.length > 0 ? (
          <div className="h-full overflow-hidden rounded-lg border bg-muted/20">
            <LocalGltfPreview
              files={threeDFiles}
              active={mode === "3d"}
              onStatusChange={setThreeDStatus}
            />
          </div>
        ) : (
          <FormatEmpty
            icon={<Box />}
            title={
              showGeneration
                ? "Your 3D model will appear here"
                : "Open a 3D file"
            }
            description={
              showGeneration
                ? threeDInputMode === "text"
                  ? "Describe what you want to create below."
                  : "Add a reference image below."
                : "Choose a GLB or a complete glTF bundle."
            }
            helpId="media-formats-3d-help"
            actionLabel={showGeneration ? undefined : "Choose file"}
            onOpen={
              showGeneration ? undefined : () => threeDInputRef.current?.click()
            }
          />
        )}
      </div>
      {showGeneration && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-4">
          <div className="pointer-events-auto w-full">
            <ThreeDGenerationControls
              initialModelId={
                initialHandoff?.mode === "3d"
                  ? initialHandoff.modelId
                  : undefined
              }
              inputMode={threeDInputMode}
              modelIds={threeDModelIds}
              onGenerated={onThreeDGenerated}
              disabled={generationDisabled}
              onBusyChange={onGenerationBusyChange}
            />
          </div>
        </div>
      )}
      {!showGeneration && threeDFiles.length > 0 && (
        <ThreeDStatusStrip
          files={threeDFiles}
          source={threeDSource}
          stored={threeDStoredMedia !== null}
          status={threeDStatus}
        />
      )}
    </div>
  );

  const audioPanel = (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className={cn("min-h-0 flex-1 p-4", showGeneration && "pb-40")}>
        {audioFile ? (
          <div className="flex h-full items-center justify-center overflow-auto rounded-lg border bg-muted/20 p-6">
            <div className="w-full max-w-2xl">
              <LocalAudioPlayer
                file={audioFile}
                active={mode === "audio"}
                onDurationChange={setAudioDuration}
              />
            </div>
          </div>
        ) : (
          <FormatEmpty
            icon={<Volume2 />}
            title={
              showGeneration
                ? "Your audio will appear here"
                : "Open an audio file"
            }
            description={
              showGeneration
                ? "Describe what you want to create below."
                : "Choose an MP3, WAV, FLAC, Ogg, or WebM file."
            }
            helpId="media-formats-audio-help"
            actionLabel={showGeneration ? undefined : "Choose file"}
            onOpen={
              showGeneration ? undefined : () => audioInputRef.current?.click()
            }
          />
        )}
      </div>
      {showGeneration && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-4">
          <div className="pointer-events-auto w-full">
            <AudioGenerationControls
              initialModelId={
                initialHandoff?.mode === "audio"
                  ? initialHandoff.modelId
                  : undefined
              }
              modelIds={audioModelIds}
              onGenerated={onAudioGenerated}
              disabled={generationDisabled}
              onBusyChange={onGenerationBusyChange}
            />
          </div>
        </div>
      )}
      {!showGeneration && audioFile && (
        <AudioStatusStrip
          file={audioFile}
          support={audioSupport}
          duration={audioDuration}
          source={audioSource}
          stored={audioStoredMedia !== null}
        />
      )}
    </div>
  );

  if (!showModeTabs) {
    return (
      <section
        data-testid="playground-media-formats"
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        {toolbar}
        {mode === "3d" && threeDInput}
        {mode === "audio" && audioInput}
        <div
          className={cn(
            "min-h-0 flex-1",
            mode === "models" && "overflow-y-auto"
          )}
        >
          {mode === "3d" ? (
            threeDPanel
          ) : mode === "audio" ? (
            audioPanel
          ) : (
            <ModelsPanel />
          )}
        </div>
      </section>
    );
  }

  return (
    <Tabs
      data-testid="playground-media-formats"
      value={mode}
      onValueChange={(value) => setMode(value as MediaFormatsPlaygroundMode)}
      className="flex min-h-0 flex-1 gap-0"
    >
      {toolbar}
      {threeDInput}
      {audioInput}

      <div className="min-h-0 flex-1">
        <TabsContent
          value="3d"
          forceMount
          className="m-0 h-full min-h-0 data-[state=inactive]:hidden"
        >
          {threeDPanel}
        </TabsContent>

        <TabsContent
          value="audio"
          forceMount
          className="m-0 h-full min-h-0 data-[state=inactive]:hidden"
        >
          {audioPanel}
        </TabsContent>

        <TabsContent
          value="models"
          className="m-0 h-full min-h-0 overflow-y-auto"
        >
          <ModelsPanel />
        </TabsContent>
      </div>
    </Tabs>
  );
}

function FormatEmpty({
  icon,
  title,
  description,
  helpId,
  actionLabel,
  onOpen,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  helpId: string;
  actionLabel?: string;
  onOpen?: () => void;
}) {
  return (
    <Empty className="h-full bg-transparent">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription id={helpId}>{description}</EmptyDescription>
      </EmptyHeader>
      {actionLabel && onOpen && (
        <EmptyContent>
          <Button type="button" variant="outline" onClick={onOpen}>
            <FileUp aria-hidden />
            {actionLabel}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}

function ThreeDStatusStrip({
  files,
  source,
  stored,
  status,
}: {
  files: readonly File[];
  source: "local" | "generated" | "stored" | null;
  stored: boolean;
  status: LocalGltfPreviewController.Status;
}) {
  let summary = "GLB stable · glTF bundle experimental";
  if (status.phase === "loading") summary = "Preparing local 3D preview…";
  if (status.phase === "error") summary = "Preview failed";
  if (status.phase === "ready") {
    summary =
      status.format.toUpperCase() +
      " · " +
      status.stability +
      " · " +
      status.objectCount.toLocaleString() +
      " objects · " +
      status.triangleCount.toLocaleString() +
      " triangles · " +
      status.animationCount.toLocaleString() +
      " animations";
  }
  const selection =
    files.length === 0
      ? "No 3D file selected"
      : source === "stored"
        ? files[0]!.name + " · saved locally"
        : source === "generated"
          ? files[0]!.name +
            " · generated · " +
            (stored ? "saved" : "not saved")
          : files.length +
            " local file" +
            (files.length === 1 ? "" : "s") +
            " selected";

  return (
    <footer
      className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-t px-6 py-2 text-xs"
      aria-live="polite"
    >
      <span className="font-medium">{selection}</span>
      <span className="text-muted-foreground">{summary}</span>
    </footer>
  );
}

function AudioStatusStrip({
  file,
  support,
  duration,
  source,
  stored,
}: {
  file: File | null;
  support: AudioCompatibility.SupportResult | null;
  duration: number | null;
  source: "local" | "generated" | "stored" | null;
  stored: boolean;
}) {
  const selection = file
    ? file.name +
      (source === "stored"
        ? " · saved locally"
        : source === "generated"
          ? " · generated · " + (stored ? "saved" : "not saved")
          : "")
    : "No audio file selected";
  return (
    <footer
      className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-t px-6 py-2 text-xs"
      aria-live="polite"
    >
      <span className="min-w-0 truncate font-medium">{selection}</span>
      <span className="text-muted-foreground">
        {file && support
          ? [
              support.label,
              formatBytes(file.size),
              formatDuration(duration),
              playbackLabel(support),
            ].join(" · ")
          : "Native playback · runtime codec probing"}
      </span>
    </footer>
  );
}

function playbackLabel(support: AudioCompatibility.SupportResult): string {
  if (support.canPlay === false) return "Unavailable";
  switch (support.playability) {
    case "probably":
      return "Playable";
    case "maybe":
      return "Runtime-dependent";
    case "unprobed":
      return "Not probed";
    case "unsupported":
      return "Unavailable";
  }
}

function formatDuration(duration: number | null): string {
  if (duration === null) return "Duration pending";
  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60);
  return minutes + ":" + seconds.toString().padStart(2, "0");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KiB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MiB";
}

function ModelsPanel() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 py-8 lg:px-8">
      <header className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Grounded contracts</Badge>
          <Badge variant="secondary">Try in playground</Badge>
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight">
          Generation models
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Exact provider routes, inputs, outputs, and meters. Open any model in
          its compatible local viewer.
        </p>
      </header>

      <section aria-labelledby="compatibility-title">
        <SectionHeading
          id="compatibility-title"
          title="Compatibility status"
          description="The stable viewer boundary is intentionally smaller than the provider output catalogue."
        />
        <div className="mt-4 grid overflow-hidden rounded-xl border md:grid-cols-3 md:divide-x">
          <CompatibilityStatus
            label="3D preview"
            status="Ready"
            detail="GLB stable; glTF bundles experimental. FBX, OBJ, and USDZ are not directly previewed in this spike."
          />
          <CompatibilityStatus
            label="Audio preview"
            status="Ready"
            detail="MP3, WAV, FLAC, Ogg/Opus, and WebM stable; M4A/AAC checked by the runtime."
          />
          <CompatibilityStatus
            label="Generation"
            status="Testable"
            detail="Generation is available when this Desktop build exposes the route and its provider is ready."
          />
        </div>
      </section>

      <section aria-labelledby="model-contracts-title">
        <SectionHeading
          id="model-contracts-title"
          title="Grounded model contracts"
          description="Provider-specific execution returns to the common local File viewer boundary."
        />

        <div className="mt-5 flex flex-col gap-8">
          <ModelGroup
            title="Text/image to 3D"
            description="fal-only endpoints. Every route returns GLB as its portable primary output."
            badge="fal only"
          >
            <div className="grid gap-3 lg:grid-cols-3">
              {THREE_D_MODELS.map((card) => (
                <ThreeDModelContract key={card.id} card={card} />
              ))}
            </div>
          </ModelGroup>

          <div className="grid gap-8 xl:grid-cols-2">
            <ModelGroup
              title="Text to music"
              description="Hosted Lyria generation through the active Grida session. The first Desktop spike uses text prompts."
              badge="Hosted"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {MUSIC_MODELS.map((card) => (
                  <MusicModelContract key={card.id} card={card} />
                ))}
              </div>
            </ModelGroup>

            <ModelGroup
              title="Text to sound effects"
              description="The ElevenLabs-only route selected for useful sound-effect generation."
              badge="ElevenLabs only"
            >
              <div className="grid gap-3">
                {SOUND_EFFECT_MODELS.map((card) => (
                  <SoundEffectModelContract key={card.id} card={card} />
                ))}
              </div>
            </ModelGroup>
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-3xl">
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function CompatibilityStatus({
  label,
  status,
  detail,
}: {
  label: string;
  status: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-b p-4 last:border-b-0 md:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <Badge variant="outline">{status}</Badge>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function ModelGroup({
  title,
  description,
  badge,
  children,
}: {
  title: string;
  description: string;
  badge: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        <Badge variant="secondary">{badge}</Badge>
      </div>
      {children}
    </section>
  );
}

function ThreeDModelContract({
  card,
}: {
  card: models.three_d.ThreeDModelCard;
}) {
  const input =
    card.input.type === "text"
      ? "Text · up to " + card.input.max_utf8_characters + " UTF-8 characters"
      : card.input.max_images === 1
        ? "One image"
        : "One front image in this playground · provider supports up to " +
          card.input.max_images +
          " named views";
  const optionalOutputs = card.output.optional.map((format) =>
    format.toUpperCase()
  );
  const output = [card.output.primary.toUpperCase(), ...optionalOutputs].join(
    " · "
  );
  const price =
    card.pricing.type === "per_generation_base_plus_surcharges"
      ? "From $" + card.pricing.base_usd.toFixed(3) + " / generation"
      : "$" +
        Math.min(...Object.values(card.pricing.usd_by_resolution)).toFixed(2) +
        "–$" +
        Math.max(...Object.values(card.pricing.usd_by_resolution)).toFixed(2) +
        " / generation";

  return (
    <ModelContractCard
      title={card.label}
      modelId={card.id}
      description={card.short_description}
      status="Testable"
      rows={[
        ["Provider", "fal"],
        ["Input", input],
        ["Provider outputs", output],
        ["Meter", price],
      ]}
      href={DesktopMediaTool.hrefForModel(card.id)}
    />
  );
}

function MusicModelContract({ card }: { card: models.audio.MusicModelCard }) {
  return (
    <ModelContractCard
      title={card.label}
      modelId={card.id}
      description={card.short_description}
      status="Hosted"
      rows={[
        ["Provider", "Replicate"],
        ["Input", "Text · image references deferred in the Desktop spike"],
        [
          "Output",
          card.output_format.toUpperCase() + " · " + card.duration_label,
        ],
        ["Meter", "$" + card.pricing.usd.toFixed(2) + " / output"],
      ]}
      href={DesktopMediaTool.hrefForModel(card.id)}
    />
  );
}

function SoundEffectModelContract({
  card,
}: {
  card: models.audio.SoundEffectModelCard;
}) {
  return (
    <ModelContractCard
      title={card.label}
      modelId={card.id}
      description={card.short_description}
      status="Testable"
      rows={[
        ["Provider", "ElevenLabs"],
        ["Input", "Text"],
        [
          "Output",
          card.output_format.toUpperCase() + " · " + card.duration_label,
        ],
        [
          "Meter",
          card.pricing.automatic_duration_credits +
            " credits automatic · " +
            card.pricing.specified_duration_credits_per_second +
            " credits/s fixed",
        ],
      ]}
      href={DesktopMediaTool.hrefForModel(card.id)}
    />
  );
}

function ModelContractCard({
  title,
  modelId,
  description,
  status,
  rows,
  href,
}: {
  title: string;
  modelId: string;
  description: string;
  status: string;
  rows: readonly (readonly [label: string, value: string])[];
  href: string;
}) {
  return (
    <article className="flex h-full flex-col rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold leading-5">{title}</h4>
          <p className="mt-1 break-all font-mono text-[11px] leading-4 text-muted-foreground">
            {modelId}
          </p>
        </div>
        <Badge variant="outline">{status}</Badge>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
      <dl className="mt-4 grid gap-2 border-t pt-3">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="grid grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)] gap-3 text-xs leading-5"
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <Button asChild size="sm" variant="outline" className="mt-4 w-full">
        <Link href={href} scroll={false}>
          <Sparkles aria-hidden />
          Try in playground
        </Link>
      </Button>
    </article>
  );
}

function DownloadFileButton({ file }: { file: File }) {
  const download = () => {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <Button size="sm" variant="outline" onClick={download}>
      <Download aria-hidden />
      Download
    </Button>
  );
}

"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Bone,
  Check,
  ChevronDown,
  FileUp,
  FolderSearch,
  Loader2,
  Pause,
  Play,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { catalog } from "@grida/ai-models/grida";
import { TripoLogo } from "@grida/react-icons/logos";
import { Button } from "@app/ui/components/button";
import { Label } from "@app/ui/components/label";
import { Switch } from "@app/ui/components/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@app/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@app/ui/components/select";
import { Tabs, TabsList, TabsTrigger } from "@app/ui/components/tabs";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@app/ui/components/empty";
import {
  rigging,
  type MediaItem,
  type RigCheckResult,
  type RiggingGenerateResult,
} from "@/lib/desktop/bridge";
import { LocalGltfPreview } from "../media-formats/local-gltf-preview";
import { RiggingMotion } from "../media-formats/rigging-motion";
import type { LocalGltfPreviewController } from "../media-formats/local-gltf-preview-controller";
import { FileDownloadButton } from "../shared/file-download-button";
import { generatedMediaFile } from "../shared/generated-media-file";
import { GridaGatewayTripo } from "@/lib/desktop/gg-tripo";
import { TripoFunding, TripoConnection } from "../shared/gg-tripo-funding";
import { RiggingForm } from "./rigging-form";

type RiggedOutput = { files: readonly File[]; receipt: RiggingGenerateResult };

/** Existing-asset rigging workflow; provider execution stays behind the native bridge. */
// Interaction contract: test/desktop-media-rigging.md.
// Motion preview contract: test/desktop-rigging-motion-preview.md.
export function RiggingPlayground({
  initialModelId,
  initialSource,
  generationDisabled = false,
  onGenerationBusyChange,
  onStoredMediaCreated,
  onRevealStoredMedia,
}: {
  initialModelId?: string;
  initialSource?: File;
  generationDisabled?: boolean;
  onGenerationBusyChange?: (busy: boolean) => void;
  onStoredMediaCreated?: (item: MediaItem) => void;
  onRevealStoredMedia?: (item: MediaItem) => void;
}) {
  const supported = rigging.isSupported();
  const [sourceFiles, setSourceFiles] = useState<readonly File[]>(
    initialSource ? [initialSource] : []
  );
  const source = sourceFiles[0];
  const [mesh, setMesh] = useState<RiggingForm.Mesh | null>(null);
  const [eligibility, setEligibility] = useState<RigCheckResult | null>(null);
  const [modelId, setModelId] =
    useState<catalog.three_d.rigging.ModelId | null>(
      initialModelId && catalog.three_d.rigging.is_model_id(initialModelId)
        ? initialModelId
        : null
    );
  const [spec, setSpec] = useState<catalog.three_d.rigging.Spec | null>(null);
  const [output, setOutput] = useState<RiggedOutput | null>(null);
  const [view, setView] = useState("original");
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [previewMotion, setPreviewMotion] =
    useState<LocalGltfPreviewController.PreviewMotion>("rest");
  const [motionPlaying, setMotionPlaying] = useState(true);
  const [motionStatus, setMotionStatus] =
    useState<LocalGltfPreviewController.MotionStatus>({ phase: "idle" });
  const [status, setStatus] = useState<LocalGltfPreviewController.Status>({
    phase: "idle",
  });
  // GRIDA-GG: desktop — a payment lane never changes implicitly after a failure.
  const hostedSupported = rigging.isGgSupported();
  const [provider, setProvider] = useState<GridaGatewayTripo.Provider>(
    hostedSupported ? "gg" : "tripo"
  );
  const access = useMemo(
    () => new GridaGatewayTripo.Access(hostedSupported),
    [hostedSupported]
  );
  const accessState = useSyncExternalStore(
    access.subscribe,
    access.getSnapshot,
    access.getSnapshot
  );
  useEffect(() => access.connect(), [access]);
  const connection = GridaGatewayTripo.connection(provider, accessState);
  const [busy, setBusy] = useState<"check" | "rig" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = generationDisabled || busy !== null;
  const models = eligibility?.riggable
    ? RiggingForm.compatibleModels(eligibility.rig_type)
    : [];
  const model = models.find((card) => card.id === modelId);
  const viewingOutput = view === "rigged" && output !== null;
  const previewFiles = viewingOutput ? output.files : sourceFiles;
  const hasRig = status.phase === "ready" && status.skinnedMeshCount > 0;
  const previewMode = output !== null || hasRig;
  const playing =
    hasRig &&
    previewMotion !== "rest" &&
    motionStatus.phase === "ready" &&
    motionPlaying;
  const selectedMotion = RiggingMotion.presets.find(
    ({ id }) => id === previewMotion
  );
  const motionMessage =
    hasRig && previewMotion !== "rest"
      ? motionStatus.phase === "error"
        ? motionStatus.message
        : motionStatus.phase === "unsupported"
          ? "Animation preview needs a compatible humanoid skeleton."
          : motionStatus.phase === "loading"
            ? `Preparing ${selectedMotion?.label ?? "animation"} preview…`
            : null
      : null;
  const humanoidRig = status.phase === "ready" && status.humanoidRig;
  const boneNames =
    spec ?? (eligibility?.rig_type === "biped" ? "mixamo" : "tripo");

  const changeSource = (file?: File) => {
    if (locked) return;
    setSourceFiles(file ? [file] : []);
    setMesh(null);
    setEligibility(null);
    setOutput(null);
    setView("original");
    setError(null);
    setStatus({ phase: "idle" });
    setPreviewMotion("rest");
    setMotionPlaying(true);
  };

  const check = async () => {
    if (!source || locked || !connection.ready) return;
    setBusy("check");
    onGenerationBusyChange?.(true);
    setError(null);
    try {
      const encoded = await RiggingForm.mesh(source);
      const result = await GridaGatewayTripo.execute(provider, () =>
        rigging.check({
          provider,
          input: { mesh: encoded },
        })
      );
      setMesh(encoded);
      setEligibility(result);
      const compatible = result.riggable
        ? RiggingForm.compatibleModels(result.rig_type)
        : [];
      setModelId(
        compatible.find((card) => card.id === modelId)?.id ??
          compatible[0]?.id ??
          null
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not check the model."
      );
    } finally {
      setBusy(null);
      onGenerationBusyChange?.(false);
    }
  };

  const rig = async () => {
    if (
      !mesh ||
      !eligibility?.riggable ||
      !model ||
      locked ||
      !connection.ready
    )
      return;
    setBusy("rig");
    onGenerationBusyChange?.(true);
    setError(null);
    try {
      const request = RiggingForm.request(
        model.id,
        mesh,
        eligibility.rig_type,
        boneNames,
        provider
      );
      const result = await GridaGatewayTripo.execute(provider, () =>
        rigging.generate(request)
      );
      setOutput({
        files: [generatedMediaFile(result.glb, "rigged.glb")],
        receipt: result,
      });
      setView("rigged");
      setShowSkeleton(true);
      setPreviewMotion("rest");
      setMotionPlaying(true);
      if (result.stored_media) onStoredMediaCreated?.(result.stored_media);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not rig the model."
      );
    } finally {
      setBusy(null);
      onGenerationBusyChange?.(false);
    }
  };

  const riggingControls = (
    <div className="space-y-3">
      <div
        className={
          previewMode
            ? "space-y-4"
            : "space-y-4 rounded-2xl border bg-background p-4 shadow-lg"
        }
      >
        <div className="flex items-start gap-3" role="status">
          <div className="mt-0.5 rounded-md bg-muted p-2">
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : eligibility?.riggable ? (
              <Check className="size-4" />
            ) : (
              <Bone className="size-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {busy === "check"
                ? "Checking compatibility…"
                : busy === "rig"
                  ? "Rigging your model…"
                  : eligibility?.riggable
                    ? `${RiggingForm.bodyLabels[eligibility.rig_type]} · Ready to rig`
                    : eligibility
                      ? "This model cannot be rigged"
                      : "Start with a compatibility check"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {busy
                ? "Keep this window open while the task completes."
                : eligibility && !eligibility.riggable
                  ? "Try a character with a clear body and separated limbs."
                  : eligibility?.riggable
                    ? "Add a skeleton while keeping your original model."
                    : "Find the right skeleton for your model. The check is free."}
            </p>
          </div>
        </div>
        <TripoFunding
          value={provider}
          onChange={setProvider}
          hostedSupported={hostedSupported}
          disabled={locked}
        />
        <div className="flex flex-wrap items-end justify-between gap-3">
          {model ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="rigging-model">
                  Model
                </Label>
                <Select
                  value={model.id}
                  disabled={locked}
                  onValueChange={(id) => {
                    if (catalog.three_d.rigging.is_model_id(id)) setModelId(id);
                  }}
                >
                  <SelectTrigger id="rigging-model" className="h-9 w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((card) => (
                      <SelectItem key={card.id} value={card.id}>
                        {card.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="rigging-spec">
                  Bone names
                </Label>
                <Select
                  value={boneNames}
                  disabled={locked}
                  onValueChange={(value) => {
                    if (value === "tripo" || value === "mixamo") setSpec(value);
                  }}
                >
                  <SelectTrigger id="rigging-spec" className="h-9 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tripo">Tripo</SelectItem>
                    <SelectItem value="mixamo">Mixamo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TripoLogo className="size-4" aria-hidden />
              Tripo auto rigging
            </div>
          )}
          {eligibility?.riggable ? (
            <Button
              disabled={locked || !model || !connection.ready}
              onClick={() => void rig()}
            >
              {busy === "rig" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Bone className="size-4" />
              )}
              Rig model
              {model
                ? ` · $${(model.pricing.credits * model.pricing.usd_per_credit).toFixed(2)}`
                : ""}
            </Button>
          ) : (
            <Button
              disabled={locked || !source || !connection.ready}
              onClick={() => void check()}
            >
              {busy === "check" && <Loader2 className="size-4 animate-spin" />}
              Check compatibility
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  if (!supported)
    return (
      <section
        data-testid="playground-rigging"
        className="flex flex-1 items-center justify-center p-8"
      >
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bone />
            </EmptyMedia>
            <EmptyTitle>Update Desktop to use rigging</EmptyTitle>
            <EmptyDescription>
              This Desktop build does not support rigging yet.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    );

  return (
    <section
      data-testid="playground-rigging"
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-3 px-6 py-4">
        <h2 className="mr-2 text-2xl font-bold tracking-tight">Rigging</h2>
        {output && (
          <Tabs value={view} onValueChange={setView}>
            <TabsList aria-label="Model version">
              <TabsTrigger value="original">Original</TabsTrigger>
              <TabsTrigger value="rigged">Rigged</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {previewMode && busy && (
            <span
              className="flex items-center gap-2 text-xs text-muted-foreground"
              role="status"
            >
              <Loader2 className="size-3.5 animate-spin" />
              {busy === "check"
                ? "Checking compatibility…"
                : "Rigging your model…"}
            </span>
          )}
          {previewMode && (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost">
                  Rigging options
                  <ChevronDown className="size-3.5" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-96 max-w-[calc(100vw-2rem)] space-y-4"
                aria-label="Rigging options"
              >
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">Rigging options</h3>
                  {output && (
                    <p className="text-xs text-muted-foreground">
                      Rig again using your original model.
                    </p>
                  )}
                </div>
                {riggingControls}
              </PopoverContent>
            </Popover>
          )}
          {viewingOutput && (
            <>
              <FileDownloadButton file={output.files[0]} />
              {output.receipt.stored_media && onRevealStoredMedia && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onRevealStoredMedia(output.receipt.stored_media!)
                  }
                >
                  <FolderSearch aria-hidden />
                  Show in folder
                </Button>
              )}
            </>
          )}
          {source && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={locked}
                onClick={() => inputRef.current?.click()}
              >
                <FileUp aria-hidden />
                Replace
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={locked}
                onClick={() => changeSource()}
              >
                <X aria-hidden />
                Clear
              </Button>
            </>
          )}
        </div>
      </header>
      <input
        ref={inputRef}
        className="sr-only"
        tabIndex={-1}
        type="file"
        accept=".glb,model/gltf-binary"
        aria-label="Open model for rigging"
        disabled={locked}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) changeSource(file);
        }}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        <div
          className={`relative min-h-80 flex-1 overflow-hidden rounded-lg border ${source ? "bg-[#111318]" : "bg-muted/10"}`}
        >
          {source ? (
            <div className={previewMode ? "h-full pb-16" : "h-full"}>
              <LocalGltfPreview
                files={previewFiles}
                showSkeleton={showSkeleton}
                previewMotion={hasRig ? previewMotion : "rest"}
                motionPlaying={motionPlaying}
                onMotionStatusChange={setMotionStatus}
                onStatusChange={setStatus}
              />
            </div>
          ) : (
            <Empty className="h-full min-h-80 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Bone />
                </EmptyMedia>
                <EmptyTitle>Add a skeleton to your model</EmptyTitle>
                <EmptyDescription>
                  Open a GLB, check compatibility, and prepare your character
                  for animation.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => inputRef.current?.click()}>
                  <FileUp aria-hidden />
                  Open 3D model
                </Button>
                <p className="text-xs text-muted-foreground">
                  GLB · Up to 60 MB
                </p>
              </EmptyContent>
            </Empty>
          )}
          {source && (
            <div className="absolute left-3 top-3 max-w-[70%] truncate rounded-md bg-background/90 px-3 py-1.5 text-xs">
              {viewingOutput ? "Rigged model" : source.name}
            </div>
          )}
          {previewMode && (
            <div className="absolute right-3 top-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="secondary"
                    className="bg-background/90 shadow-sm"
                    aria-label="Viewport settings"
                    title="Viewport settings"
                  >
                    <SlidersHorizontal className="size-4" aria-hidden />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-64 space-y-4"
                  aria-label="Viewport settings"
                >
                  <h3 className="text-sm font-medium">Viewport</h3>
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="rigging-skeleton" className="text-xs">
                      Show skeleton
                    </Label>
                    <Switch
                      id="rigging-skeleton"
                      checked={hasRig && showSkeleton}
                      disabled={!hasRig}
                      onCheckedChange={setShowSkeleton}
                    />
                  </div>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    {hasRig && status.phase === "ready" ? (
                      <p>
                        {status.jointCount} joints · {status.skinnedMeshCount}{" "}
                        skinned{" "}
                        {status.skinnedMeshCount === 1 ? "mesh" : "meshes"}
                      </p>
                    ) : (
                      <p>This view has no skeleton.</p>
                    )}
                    <p>Drag to orbit · Scroll to zoom</p>
                  </div>
                  <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
                    <p>
                      Animations are preview only. Downloads keep the original
                      pose.
                    </p>
                    {RiggingMotion.presets.map((preset) => (
                      <p key={preset.id}>
                        {preset.label} by{" "}
                        <a
                          href={preset.licenseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-4"
                        >
                          {preset.attribution}
                        </a>
                      </p>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}
          {motionMessage && (
            <p
              className="pointer-events-none absolute inset-x-3 bottom-20 text-center text-xs text-white/70"
              role="status"
            >
              {motionMessage}
            </p>
          )}
          {previewMode && (
            <div
              className="absolute inset-x-0 bottom-0 flex h-16 items-center justify-center gap-2 border-t border-white/10 bg-[#111318] px-3 text-white"
              role="group"
              aria-label="Animation playback"
            >
              <Label
                htmlFor="rigging-motion"
                className="mr-1 text-xs text-white/60"
              >
                Animation
              </Label>
              <Select
                value={hasRig ? previewMotion : "rest"}
                disabled={!hasRig}
                onValueChange={(value) => {
                  const preset = RiggingMotion.presets.find(
                    ({ id }) => id === value
                  );
                  if (value === "rest" || preset) {
                    setPreviewMotion(preset?.id ?? "rest");
                    setMotionPlaying(true);
                  }
                }}
              >
                <SelectTrigger
                  id="rigging-motion"
                  className="h-9 w-44 border-white/15 bg-transparent text-xs text-white"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rest">Rest pose</SelectItem>
                  {RiggingMotion.presets.map((preset) => (
                    <SelectItem
                      key={preset.id}
                      value={preset.id}
                      disabled={!humanoidRig}
                    >
                      {preset.label}
                    </SelectItem>
                  ))}
                  {!humanoidRig && (
                    <p className="max-w-52 px-2 py-1.5 text-xs text-muted-foreground">
                      Animations require a compatible humanoid rig.
                    </p>
                  )}
                </SelectContent>
              </Select>
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-white hover:bg-white/10 hover:text-white"
                aria-label={playing ? "Pause motion" : "Play motion"}
                disabled={
                  !hasRig ||
                  previewMotion === "rest" ||
                  motionStatus.phase !== "ready"
                }
                onClick={() => setMotionPlaying((value) => !value)}
              >
                {hasRig &&
                previewMotion !== "rest" &&
                motionStatus.phase === "loading" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : playing ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
              </Button>
            </div>
          )}
        </div>
        {!previewMode && (
          <div className="mx-auto w-full max-w-2xl shrink-0">
            {riggingControls}
          </div>
        )}
        <div className="flex shrink-0 flex-wrap justify-between gap-2 px-1 text-xs text-muted-foreground">
          <TripoConnection
            connection={connection}
            onRefresh={() => void access.refresh()}
          />
          {output?.receipt.task.credits_consumed !== undefined && (
            <span>
              {output.receipt.provider_id === "gg"
                ? `$${(output.receipt.task.credits_consumed * catalog.three_d.rigging.models[output.receipt.model_id].pricing.usd_per_credit).toFixed(2)} used in Grida credits`
                : `${output.receipt.task.credits_consumed} Tripo credits used`}
            </span>
          )}
        </div>
        {error && (
          <p
            className="max-h-24 shrink-0 overflow-auto break-words px-3 text-xs text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

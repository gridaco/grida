"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ImagePlus, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@app/ui/components/button";
import { Input } from "@app/ui/components/input";
import { Label } from "@app/ui/components/label";
import { Switch } from "@app/ui/components/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@app/ui/components/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@app/ui/components/popover";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputButton,
  PromptInputSubmit,
} from "@app/ui/ai-elements/prompt-input";
import {
  modelGeneration,
  type ModelGenerationGenerateResult,
} from "@/lib/desktop/bridge";
import { GridaGatewayTripo } from "@/lib/desktop/gg-tripo";
import { TripoFunding, TripoConnection } from "../shared/gg-tripo-funding";
import { ModelGenerationForm } from "./model-generation-form";

const VIEW_LABELS: Record<ModelGenerationForm.View, string> = {
  front: "Front view",
  left: "Left view",
  back: "Back view",
  right: "Right view",
};
const TEXTURE_LABELS = {
  standard: "Standard",
  detailed: "HD",
  extreme: "8K",
} as const;

export function ModelGenerationControls({
  modelId,
  variant,
  modelPicker,
  disabled = false,
  onBusyChange,
  onGenerated,
}: {
  modelId: ModelGenerationForm.ModelId;
  variant: ModelGenerationForm.Variant;
  modelPicker: ReactNode;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
  onGenerated: (result: ModelGenerationGenerateResult) => void;
}) {
  const id = useId();
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<
    Partial<Record<ModelGenerationForm.View, File>>
  >({});
  const [settings, setSettings] = useState<ModelGenerationForm.Settings>({
    ...ModelGenerationForm.defaults,
  });
  const [settingsModel, setSettingsModel] = useState(modelId);
  const [busy, setBusy] = useState(false);
  // GRIDA-GG: desktop — funding choice stays explicit for every submission.
  const hostedSupported = modelGeneration.isGgSupported();
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
  const [error, setError] = useState<string | null>(null);
  const card = ModelGenerationForm.card(modelId);
  const locked = disabled || busy;
  const credits = ModelGenerationForm.estimatedCredits(
    modelId,
    variant,
    settings
  );

  // Model-specific limits reset; the user's prompt and reference images remain.
  if (settingsModel !== modelId) {
    setSettingsModel(modelId);
    setSettings((current) => ({
      ...current,
      face_limit: "",
      geometry_quality: "standard",
    }));
    setError(null);
  }

  const changeSetting = <K extends keyof ModelGenerationForm.Settings>(
    key: K,
    value: ModelGenerationForm.Settings[K]
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const submit = async () => {
    if (locked || !connection.ready) return;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      const request = await ModelGenerationForm.request({
        modelId,
        variant,
        prompt,
        images,
        settings,
        provider,
      });
      onGenerated(
        await GridaGatewayTripo.execute(provider, () =>
          modelGeneration.generate(request)
        )
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Model generation failed."
      );
      throw cause;
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };
  return (
    <div
      data-testid="controls-model-generation"
      className="mx-auto w-full max-w-2xl"
    >
      <PromptInput
        onSubmit={submit}
        maxFiles={0}
        className="w-full [&>div]:rounded-2xl [&>div]:bg-background [&>div]:shadow-lg"
      >
        <PromptInputBody>
          {variant === "text" ? (
            <PromptInputTextarea
              aria-label="3D generation prompt"
              value={prompt}
              maxLength={1024}
              disabled={locked}
              placeholder="Describe the 3D model you want to create…"
              onChange={(event) => {
                setPrompt(event.target.value);
                setError(null);
              }}
            />
          ) : (
            <div className="w-full space-y-3 px-3 pt-3 pb-1">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  {variant === "multiview"
                    ? "Add views of your object"
                    : "Start with an image"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {variant === "multiview"
                    ? "Add the front and at least one other angle."
                    : "Choose a clear image of a single object."}
                </p>
              </div>
              <div
                className={
                  variant === "multiview"
                    ? "grid max-w-sm grid-cols-4 gap-2"
                    : "w-20"
                }
              >
                {(variant === "multiview"
                  ? ModelGenerationForm.views
                  : ["front" as const]
                ).map((view) => (
                  <ReferenceImage
                    key={view}
                    label={
                      variant === "image"
                        ? "Reference image"
                        : VIEW_LABELS[view]
                    }
                    required={view === "front"}
                    file={images[view]}
                    disabled={locked}
                    onChange={(file) => {
                      setImages((current) => ({ ...current, [view]: file }));
                      setError(null);
                    }}
                    onError={setError}
                  />
                ))}
              </div>
            </div>
          )}
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools className="min-w-0 flex-wrap">
            {modelPicker}
            <Popover>
              <PopoverTrigger asChild>
                <PromptInputButton
                  aria-label="Generation options"
                  title="Generation options"
                  disabled={locked}
                >
                  <SlidersHorizontal className="size-4" />
                </PromptInputButton>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="start"
                aria-label="Generation options"
                className="max-h-[min(70vh,32rem)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto"
              >
                <h3 className="text-sm font-medium">Generation options</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {card.short_description}
                </p>
                <div className="mt-4 space-y-4">
                  <TripoFunding
                    value={provider}
                    onChange={setProvider}
                    hostedSupported={hostedSupported}
                    disabled={locked}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={`${id}-texture`}>Texture</Label>
                    <Switch
                      id={`${id}-texture`}
                      checked={settings.texture}
                      disabled={locked}
                      onCheckedChange={(checked) =>
                        changeSetting("texture", checked)
                      }
                    />
                  </div>
                  {settings.texture && (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor={`${id}-pbr`}>PBR materials</Label>
                        <Switch
                          id={`${id}-pbr`}
                          checked={settings.pbr}
                          disabled={locked}
                          onCheckedChange={(checked) =>
                            changeSetting("pbr", checked)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${id}-texture-quality`}>
                          Texture quality
                        </Label>
                        <Select
                          value={settings.texture_quality}
                          disabled={locked}
                          onValueChange={(value) =>
                            changeSetting(
                              "texture_quality",
                              value as ModelGenerationForm.Settings["texture_quality"]
                            )
                          }
                        >
                          <SelectTrigger
                            id={`${id}-texture-quality`}
                            className="w-full"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {card.texture_quality.map((quality) => (
                              <SelectItem key={quality} value={quality}>
                                {TEXTURE_LABELS[quality]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                  {card.geometry_quality && (
                    <div className="space-y-2">
                      <Label htmlFor={`${id}-geometry`}>Geometry quality</Label>
                      <Select
                        value={settings.geometry_quality}
                        disabled={locked}
                        onValueChange={(value) =>
                          changeSetting(
                            "geometry_quality",
                            value as ModelGenerationForm.Settings["geometry_quality"]
                          )
                        }
                      >
                        <SelectTrigger id={`${id}-geometry`} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {card.geometry_quality.map((quality) => (
                            <SelectItem key={quality} value={quality}>
                              {quality === "detailed" ? "Detailed" : "Standard"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor={`${id}-faces`}>Face limit</Label>
                    <Input
                      id={`${id}-faces`}
                      type="number"
                      step={1}
                      min={card.face_limit.min}
                      max={ModelGenerationForm.maxFaces(modelId, settings)}
                      value={settings.face_limit}
                      disabled={locked}
                      placeholder="Automatic"
                      onChange={(event) =>
                        changeSetting("face_limit", event.target.value)
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      {card.face_limit.min.toLocaleString()}–
                      {ModelGenerationForm.maxFaces(
                        modelId,
                        settings
                      ).toLocaleString()}{" "}
                      faces.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${id}-seed`}>Geometry seed</Label>
                    <Input
                      id={`${id}-seed`}
                      type="number"
                      step={1}
                      value={settings.seed}
                      disabled={locked}
                      placeholder="Random"
                      onChange={(event) =>
                        changeSetting("seed", event.target.value)
                      }
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </PromptInputTools>
          <PromptInputSubmit
            status={busy ? "submitted" : undefined}
            disabled={locked || !connection.ready}
            aria-label="Generate 3D model"
          />
        </PromptInputFooter>
      </PromptInput>
      <div
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 pt-2 text-xs text-muted-foreground"
        aria-live="polite"
      >
        <TripoConnection
          connection={connection}
          onRefresh={() => void access.refresh()}
        />
        <span>
          Estimated ${(credits * card.pricing.usd_per_credit).toFixed(2)}
          {provider === "gg"
            ? " · Grida credits"
            : ` · ${credits} Tripo credits`}
        </span>
      </div>
      {error && (
        <p
          className="max-h-24 overflow-auto break-words px-3 pt-2 text-xs text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function ReferenceImage({
  label,
  required,
  file,
  disabled,
  onChange,
  onError,
}: {
  label: string;
  required: boolean;
  file?: File;
  disabled: boolean;
  onChange: (file: File | undefined) => void;
  onError: (message: string) => void;
}) {
  const id = useId();
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!file) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return (
    <div className="min-w-0">
      <Label htmlFor={id} className="sr-only">
        {label}
        {required ? " *" : ""}
      </Label>
      <div className="group relative overflow-hidden rounded-xl border border-dashed bg-muted/20 transition-colors hover:border-muted-foreground/40 hover:bg-muted/40 focus-within:ring-2 focus-within:ring-ring">
        <label
          htmlFor={id}
          title={`${label}${required ? " (required)" : ""} · PNG or JPEG, up to 8 MiB`}
          className={`flex h-20 cursor-pointer flex-col items-center justify-center gap-1.5 p-2 text-xs text-muted-foreground ${disabled ? "pointer-events-none opacity-60" : ""}`}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob URL; Desktop CSP excludes image optimization.
            <img
              src={url}
              alt={label}
              className="absolute inset-0 h-full w-full object-contain"
            />
          ) : (
            <>
              <ImagePlus className="size-5" aria-hidden />
              <span className="text-[11px]">
                {label === "Reference image"
                  ? "Add image"
                  : label.replace(" view", "")}
              </span>
            </>
          )}
          <input
            id={id}
            type="file"
            accept={ModelGenerationForm.mediaTypes.join(",")}
            disabled={disabled}
            className="sr-only"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              event.target.value = "";
              if (!selected) return;
              try {
                ModelGenerationForm.validateImage(selected);
                onChange(selected);
              } catch (cause) {
                onError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not read the image."
                );
              }
            }}
          />
        </label>
        {file && label !== "Reference image" && (
          <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px]">
            {label.replace(" view", "")}
          </span>
        )}
        {file && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute right-1 top-1 size-6"
            disabled={disabled}
            aria-label={`Remove ${label.toLowerCase()}`}
            onClick={() => onChange(undefined)}
          >
            <X className="size-3.5" aria-hidden />
          </Button>
        )}
      </div>
      {file && (
        <p
          className="mt-1 truncate text-[10px] text-muted-foreground"
          title={file.name}
        >
          {file.name}
        </p>
      )}
    </div>
  );
}

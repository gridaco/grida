"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ImagePlus, Loader2, X } from "lucide-react";
import { catalog as models } from "@grida/ai-models/grida";
import { Button } from "@app/ui/components/button";
import { Input } from "@app/ui/components/input";
import { Label } from "@app/ui/components/label";
import { Textarea } from "@app/ui/components/textarea";
import { Switch } from "@app/ui/components/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@app/ui/components/select";
import { Tabs, TabsList, TabsTrigger } from "@app/ui/components/tabs";
import {
  modelGeneration,
  secrets,
  type ModelGenerationGenerateResult,
} from "@/lib/desktop/bridge";
import { ModelGenerationForm } from "./model-generation-form";
import { MediaModelAvailability } from "../shared/media-model-availability";

const VARIANT_LABELS: Record<ModelGenerationForm.Variant, string> = {
  text: "Text",
  image: "Image",
  multiview: "Multiview",
};
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

type ModelGenerationControlsProps = {
  initialModelId?: ModelGenerationForm.ModelId;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
  onGenerated: (result: ModelGenerationGenerateResult) => void;
};

export function ModelGenerationControls(props: ModelGenerationControlsProps) {
  const availableModels = models.three_d.model_generation.ordered_models();
  const initialModel = MediaModelAvailability.select(
    availableModels,
    props.initialModelId,
    models.three_d.model_generation.default_id
  );
  if (!initialModel) {
    return <p role="status">No model-generation models are available.</p>;
  }
  return (
    <AvailableModelGenerationControls
      key={initialModel.id}
      {...props}
      initialModelId={initialModel.id}
      availableModels={availableModels}
    />
  );
}

function AvailableModelGenerationControls({
  initialModelId,
  availableModels,
  disabled = false,
  onBusyChange,
  onGenerated,
}: ModelGenerationControlsProps & {
  initialModelId: ModelGenerationForm.ModelId;
  availableModels: readonly models.three_d.model_generation.ModelCard[];
}) {
  const id = useId();
  const [modelId, setModelId] =
    useState<ModelGenerationForm.ModelId>(initialModelId);
  const [variant, setVariant] = useState<ModelGenerationForm.Variant>("text");
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<
    Partial<Record<ModelGenerationForm.View, File>>
  >({});
  const [settings, setSettings] = useState<ModelGenerationForm.Settings>({
    ...ModelGenerationForm.defaults,
  });
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<
    "checking" | "ready" | "missing" | "error"
  >("checking");
  const [error, setError] = useState<string | null>(null);
  const card = ModelGenerationForm.card(modelId);
  const locked = disabled || busy;
  const credits = ModelGenerationForm.estimatedCredits(
    modelId,
    variant,
    settings
  );

  useEffect(() => {
    let active = true;
    let revision = 0;
    const refresh = () => {
      const requestRevision = ++revision;
      void secrets.hasKey("tripo").then(
        (present) => {
          if (active && requestRevision === revision) {
            setConnection(present ? "ready" : "missing");
          }
        },
        () => {
          if (active && requestRevision === revision) setConnection("error");
        }
      );
    };
    const whenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    // Settings can open in another native window; refresh when users return.
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", whenVisible);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", whenVisible);
    };
  }, []);

  const changeSetting = <K extends keyof ModelGenerationForm.Settings>(
    key: K,
    value: ModelGenerationForm.Settings[K]
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked || connection !== "ready") return;
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
      });
      onGenerated(await modelGeneration.generate(request));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Model generation failed."
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  return (
    <form
      data-testid="controls-model-generation"
      className="flex flex-col gap-5"
      onSubmit={(event) => void submit(event)}
    >
      <div className="space-y-2">
        <Label htmlFor={`${id}-model`}>Model</Label>
        <Select
          value={modelId}
          disabled={locked}
          onValueChange={(value) => {
            const selected = availableModels.find(
              (model) => model.id === value
            );
            if (!selected) return;
            setModelId(selected.id);
            setSettings((current) => ({
              ...current,
              face_limit: "",
              geometry_quality: "standard",
            }));
            setError(null);
          }}
        >
          <SelectTrigger id={`${id}-model`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableModels.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs leading-5 text-muted-foreground">
          {card.short_description}
        </p>
      </div>

      <Tabs
        value={variant}
        onValueChange={(value) => {
          setVariant(value as ModelGenerationForm.Variant);
          setError(null);
        }}
      >
        <TabsList className="w-full" aria-label="Model generation input">
          {card.inputs.map((input) => (
            <TabsTrigger
              key={input}
              value={input}
              disabled={locked}
              className="flex-1"
            >
              {VARIANT_LABELS[input]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {variant === "text" ? (
        <div className="space-y-2">
          <Label htmlFor={`${id}-prompt`}>Description</Label>
          <Textarea
            id={`${id}-prompt`}
            value={prompt}
            disabled={locked}
            rows={5}
            className="resize-y"
            placeholder="A small brass robot with rounded limbs and a friendly face…"
            onChange={(event) => {
              setPrompt(event.target.value);
              setError(null);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Up to 1,024 characters.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div
            className={
              variant === "multiview"
                ? "grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2"
                : "max-w-80"
            }
          >
            {(variant === "multiview"
              ? ModelGenerationForm.views
              : ["front" as const]
            ).map((view) => (
              <ReferenceImage
                key={view}
                label={
                  variant === "image" ? "Reference image" : VIEW_LABELS[view]
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
          <p className="text-xs leading-5 text-muted-foreground">
            {variant === "multiview"
              ? "Use the front and at least one other view of the same object. "
              : ""}
            PNG or JPEG, up to 8 MiB per image.
          </p>
        </div>
      )}

      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Generation options
        </summary>
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`${id}-texture`}>Texture</Label>
            <Switch
              id={`${id}-texture`}
              checked={settings.texture}
              disabled={locked}
              onCheckedChange={(checked) => changeSetting("texture", checked)}
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
                  onCheckedChange={(checked) => changeSetting("pbr", checked)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${id}-texture-quality`}>Texture quality</Label>
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
              {ModelGenerationForm.maxFaces(modelId, settings).toLocaleString()}{" "}
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
              onChange={(event) => changeSetting("seed", event.target.value)}
            />
          </div>
        </div>
      </details>

      <div className="space-y-3">
        {(connection === "missing" || connection === "error") && (
          <p className="rounded-lg border p-3 text-sm" role="status">
            {connection === "error" &&
              "Could not check your Tripo connection. "}
            <Link
              className="underline underline-offset-4"
              href="/desktop/settings#provider-tripo"
            >
              Connect your Tripo API key
            </Link>{" "}
            in Settings to generate models.
          </p>
        )}
        {error && (
          <p className="break-words text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Tripo API credits</span>
          <span>
            Estimated {credits} credits · $
            {(credits * card.pricing.usd_per_credit).toFixed(2)}
          </span>
        </div>
        <Button
          type="submit"
          disabled={locked || connection !== "ready"}
          className="w-full"
        >
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {busy
            ? "Generating…"
            : connection === "checking"
              ? "Checking connection…"
              : connection === "error"
                ? "Connection unavailable"
                : "Generate model"}
        </Button>
      </div>
    </form>
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
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </Label>
      <div className="relative overflow-hidden rounded-lg border bg-muted/20 focus-within:ring-2 focus-within:ring-ring">
        <label
          htmlFor={id}
          className={`flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 p-3 text-xs text-muted-foreground ${disabled ? "pointer-events-none opacity-60" : "hover:bg-muted/40"}`}
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
              <span>Add image</span>
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
        <p className="truncate text-xs text-muted-foreground" title={file.name}>
          {file.name}
        </p>
      )}
    </div>
  );
}

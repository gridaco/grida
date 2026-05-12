"use client";

import React, { useCallback, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/lib/utils";
import {
  AuthProvider,
  useContinueWithAuth,
} from "@/host/auth/use-continue-with-auth";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { generateAudio } from "@/lib/ai/actions/audio";
import { useAiCredits } from "@/lib/ai/credits";
import ai from "@/lib/ai";
import { DownloadIcon, Loader2Icon, Music2Icon, Wand2Icon } from "lucide-react";

const PROMPT_PRESETS = [
  "Lo-fi hip hop, mellow piano, vinyl crackle, 80 BPM",
  "Cinematic orchestral score, soaring strings, hopeful, 110 BPM",
  "Upbeat synthwave, driving bassline, retro arcade vibes, 120 BPM",
  "Acoustic folk guitar, soft fingerpicking, calm and warm",
  "Ambient pad textures, slow evolving, dreamy, no drums",
];

export default function AudioGenTool({
  initialPrompt = "",
}: {
  initialPrompt?: string;
}) {
  return (
    <AuthProvider>
      <PromptInputProvider initialInput={initialPrompt}>
        <div className="container mx-auto px-4 pt-24 md:pt-28 xl:pt-36 pb-24 min-h-screen">
          <div className="max-w-3xl mx-auto">
            <header className="mb-10 text-left">
              <h1 className="text-3xl font-semibold tracking-tight mb-3">
                AI Music Generator
              </h1>
              <p className="text-muted-foreground text-sm font-light max-w-2xl">
                Generate music with Google Lyria 3 from a text prompt or
                reference image. 48kHz stereo, MP3 output. Sign in to start —
                your free monthly budget covers the cost.
              </p>
            </header>
            <Workspace />
          </div>
        </div>
      </PromptInputProvider>
    </AuthProvider>
  );
}

type ResultItem = {
  id: number;
  url: string;
  prompt: string;
  modelId: ai.audio.AudioModelId;
};

function Workspace() {
  const { withAuth } = useContinueWithAuth();
  const credits = useAiCredits();
  const [loading, startGenerate] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modelId, setModelId] =
    useState<ai.audio.AudioModelId>("google/lyria-3");
  const [results, setResults] = useState<ResultItem[]>([]);
  const card = useMemo(() => ai.audio.models[modelId], [modelId]);

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const prompt = message.text.trim();
      if (!prompt) return;

      const image_inputs: string[] = [];
      for (const f of message.files) {
        if (
          f.url &&
          (f.url.startsWith("data:image/") || f.url.startsWith("http"))
        ) {
          image_inputs.push(f.url);
        }
      }

      setError(null);
      startGenerate(async () => {
        const env = await generateAudio({
          model: modelId,
          prompt,
          image_inputs: image_inputs.length > 0 ? image_inputs : undefined,
        });
        const data = credits.consume(env, { next: "/ai/music/playground" });
        if (!data) {
          if (env.success === false) setError(env.message);
          return;
        }
        setResults((prev) => [
          {
            id: Date.now(),
            url: data.url,
            prompt,
            modelId: data.modelId,
          },
          ...prev,
        ]);
      });
    },
    [modelId, credits]
  );

  const handleSubmitWithAuth = withAuth(handleSubmit);

  return (
    <div className="grid gap-6">
      <PromptInput
        accept="image/*"
        multiple
        maxFiles={10}
        maxFileSize={8 * 1024 * 1024}
        onSubmit={(message) => handleSubmitWithAuth(message)}
      >
        <PromptInputBody>
          <PromptInputAttachments>
            {(attachment) => <PromptInputAttachment data={attachment} />}
          </PromptInputAttachments>
          <PromptInputTextarea placeholder="Describe the music you want — genre, mood, instruments, tempo…" />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments label="Attach reference image" />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
            <Select
              value={modelId}
              onValueChange={(v) => setModelId(v as ai.audio.AudioModelId)}
            >
              <SelectTrigger className="w-min border-none h-8">
                <SelectValue>{card.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ai.audio.audio_model_ids.map((id) => {
                  const m = ai.audio.models[id];
                  return (
                    <SelectItem key={id} value={id}>
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span>{m.label}</span>
                        <Badge variant="outline" className="ml-2">
                          ~{m.duration_label}
                        </Badge>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </PromptInputTools>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">
              {credits.formatted ?? "—"} left
            </span>
            <PromptInputSubmit
              disabled={loading}
              status={loading ? "submitted" : undefined}
            />
          </div>
        </PromptInputFooter>
      </PromptInput>

      <div className="flex flex-wrap gap-2">
        {PROMPT_PRESETS.map((p) => (
          <PromptChip
            key={p}
            label={p}
            disabled={loading}
            onClick={() => handleSubmitWithAuth({ text: p, files: [] })}
          />
        ))}
      </div>

      {error && (
        <div className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md px-4 py-2">
          {error}
        </div>
      )}

      {loading && results.length === 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Generating with {card.label} — this can take 10–30 seconds…
        </div>
      )}

      <div className="space-y-4">
        {results.map((r) => (
          <ResultCard key={r.id} item={r} />
        ))}
        {results.length === 0 && !loading && <EmptyState modelId={modelId} />}
      </div>
    </div>
  );
}

function PromptChip({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
        "bg-background text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground",
        "disabled:opacity-50 disabled:cursor-not-allowed"
      )}
    >
      <Wand2Icon className="size-3" />
      {label}
    </button>
  );
}

function ResultCard({ item }: { item: ResultItem }) {
  const card = ai.audio.models[item.modelId];
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Music2Icon className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{card.label}</span>
            <Badge variant="outline">~{card.duration_label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {item.prompt}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a
            href={item.url}
            download="lyria.mp3"
            target="_blank"
            rel="noreferrer"
          >
            <DownloadIcon className="size-4 mr-2" />
            Download
          </a>
        </Button>
      </div>
      <audio controls src={item.url} className="w-full">
        <track kind="captions" />
      </audio>
    </div>
  );
}

function EmptyState({ modelId }: { modelId: ai.audio.AudioModelId }) {
  const card = ai.audio.models[modelId];
  return (
    <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-10 text-center">
      <Music2Icon className="size-6 mx-auto mb-3 text-muted-foreground" />
      <div className="text-sm font-medium">No tracks yet</div>
      <div className="text-xs text-muted-foreground mt-1">
        {card.short_description}
      </div>
    </div>
  );
}

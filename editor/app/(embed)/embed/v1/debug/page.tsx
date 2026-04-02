"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/lib/utils";

type EmbedMode = "general" | "figma";

const EMBED_PATHS: Record<EmbedMode, string> = {
  general: "/embed/v1",
  figma: "/embed/v1/figma",
};

type LogEntry = {
  ts: number;
  dir: "in" | "out";
  type: string;
  data: unknown;
};

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

export default function EmbedDebugPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [embedSrc, setEmbedSrc] = useState<string | null>(null);
  const [mode, setMode] = useState<EmbedMode>("general");
  const [ready, setReady] = useState(false);
  const [scenes, setScenes] = useState<{ id: string; name: string }[]>([]);
  const [selection, setSelection] = useState<string[]>([]);
  const [currentScene, setCurrentScene] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback(
    (dir: "in" | "out", type: string, data: unknown) => {
      setLog((prev) => [...prev, { ts: Date.now(), dir, type, data }]);
    },
    []
  );

  // Listen for messages from the embed iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (
        iframeRef.current &&
        e.source === iframeRef.current.contentWindow &&
        typeof e.data?.type === "string" &&
        e.data.type.startsWith("grida:")
      ) {
        addLog("in", e.data.type, e.data);
        switch (e.data.type) {
          case "grida:ready":
            setReady(true);
            break;
          case "grida:document-load":
            setScenes(e.data.scenes ?? []);
            setSelection([]);
            setCurrentScene(e.data.scenes?.[0]?.id ?? null);
            break;
          case "grida:selection-change":
            setSelection(e.data.selection ?? []);
            break;
          case "grida:scene-change":
            setCurrentScene(e.data.sceneId ?? null);
            break;
          case "grida:pong":
            setReady(e.data.ready ?? false);
            setScenes(e.data.scenes ?? []);
            setSelection(e.data.selection ?? []);
            setCurrentScene(e.data.sceneId ?? null);
            break;
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [addLog]);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  const postCommand = useCallback(
    (cmd: Record<string, unknown>) => {
      if (!iframeRef.current?.contentWindow) return;
      addLog("out", cmd.type as string, cmd);
      iframeRef.current.contentWindow.postMessage(cmd, "*");
    },
    [addLog]
  );

  const embedBasePath = EMBED_PATHS[mode];

  // Load preset via ?file= URL
  const loadPreset = (url: string) => {
    setReady(false);
    setScenes([]);
    setSelection([]);
    setCurrentScene(null);
    setEmbedSrc(`${embedBasePath}?file=${encodeURIComponent(url)}`);
  };

  // Load empty embed (for postMessage load)
  const loadEmpty = () => {
    setReady(false);
    setScenes([]);
    setSelection([]);
    setCurrentScene(null);
    setEmbedSrc(embedBasePath);
  };

  // Load file via postMessage
  const handleFileUpload = async (file: File) => {
    if (!iframeRef.current?.contentWindow) {
      loadEmpty();
    }
    const buf = await file.arrayBuffer();
    const name = file.name.toLowerCase();
    let format: "fig" | "json" | "json.gz" | "zip" | "grida" | "grida1";
    if (name.endsWith(".grida1")) format = "grida1";
    else if (name.endsWith(".grida")) format = "grida";
    else if (name.endsWith(".json.gz")) format = "json.gz";
    else if (name.endsWith(".json")) format = "json";
    else if (name.endsWith(".zip")) format = "zip";
    else if (name.endsWith(".gz")) format = "json.gz";
    else format = "fig";

    // Wait for embed to be ready if we just loaded empty
    const waitForReady = () =>
      new Promise<void>((resolve) => {
        if (ready) {
          resolve();
          return;
        }
        const check = (e: MessageEvent) => {
          if (e.data?.type === "grida:ready") {
            window.removeEventListener("message", check);
            resolve();
          }
        };
        window.addEventListener("message", check);
      });

    if (!ready) {
      loadEmpty();
      await waitForReady();
    }

    postCommand({ type: "grida:load", data: buf, format });
  };

  // Reset iframe when mode changes
  const handleModeChange = (newMode: EmbedMode) => {
    setMode(newMode);
    setReady(false);
    setScenes([]);
    setSelection([]);
    setCurrentScene(null);
    setLog([]);
    // If there's an active embed, reload it with the new mode's path
    if (embedSrc) {
      const url = new URL(embedSrc, window.location.origin);
      const file = url.searchParams.get("file");
      if (file) {
        setEmbedSrc(`${EMBED_PATHS[newMode]}?file=${encodeURIComponent(file)}`);
      } else {
        setEmbedSrc(EMBED_PATHS[newMode]);
      }
    }
  };

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
        <span className="font-mono text-sm font-bold">embed/v1/debug</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
            ready
              ? "bg-green-500/15 text-green-700 dark:text-green-400"
              : "bg-muted text-muted-foreground"
          )}
        >
          {ready ? "ready" : "not connected"}
        </span>
        {/* Mode indicator */}
        <span className="rounded border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {mode === "figma" ? "figma" : "general"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setLog([])}>
            Clear log
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left: controls */}
        <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r p-4">
          {/* Embed mode */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Embed mode
            </h3>
            <div className="flex gap-1.5">
              <Button
                variant={mode === "general" ? "default" : "outline"}
                size="sm"
                onClick={() => handleModeChange("general")}
              >
                General
              </Button>
              <Button
                variant={mode === "figma" ? "default" : "outline"}
                size="sm"
                onClick={() => handleModeChange("figma")}
              >
                Figma
              </Button>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              {mode === "figma"
                ? "Figma ID mapping enabled. Events use original Figma node IDs."
                : "General-purpose. Events use Grida-internal node IDs."}
            </p>
          </section>

          {/* Load via URL */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Load via ?file= URL
            </h3>
            <form
              className="flex flex-col gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const input = form.elements.namedItem(
                  "url"
                ) as HTMLInputElement;
                const url = input.value.trim();
                if (url) loadPreset(url);
              }}
            >
              <input
                name="url"
                type="url"
                placeholder="https://example.com/design.fig"
                className="rounded-md border bg-background px-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Button type="submit" variant="outline" size="sm">
                Load URL
              </Button>
            </form>
          </section>

          {/* Load via postMessage */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Load via postMessage
            </h3>
            <input
              ref={fileInputRef}
              type="file"
              accept=".grida,.grida1,.fig,.deck,.json,.json.gz,.gz,.zip,application/json,application/gzip,application/x-gzip,application/zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void handleFileUpload(f);
              }}
            />
            <div className="flex flex-col gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!embedSrc) loadEmpty();
                  fileInputRef.current?.click();
                }}
              >
                Choose file & send grida:load
              </Button>
              <Button variant="outline" size="sm" onClick={loadEmpty}>
                Load empty embed
              </Button>
            </div>
          </section>

          {/* Commands */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Commands
            </h3>
            <div className="flex flex-col gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => postCommand({ type: "grida:ping" })}
              >
                ping
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!ready}
                onClick={() =>
                  postCommand({ type: "grida:fit", animate: true })
                }
              >
                fit (animate)
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!ready}
                onClick={() =>
                  postCommand({
                    type: "grida:select",
                    nodeIds: [],
                    mode: "reset",
                  })
                }
              >
                clear selection
              </Button>
              {scenes.length > 1 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase text-muted-foreground">
                    Scenes
                  </span>
                  {scenes.map((s) => (
                    <Button
                      key={s.id}
                      variant={currentScene === s.id ? "default" : "outline"}
                      size="sm"
                      onClick={() =>
                        postCommand({ type: "grida:load-scene", sceneId: s.id })
                      }
                    >
                      {s.name}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* State */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              State
            </h3>
            <div className="space-y-1 text-xs">
              <div>
                <span className="text-muted-foreground">Mode: </span>
                <span className="font-mono">{mode}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Embed: </span>
                <span className="font-mono">{embedBasePath}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Scene: </span>
                <span className="font-mono">{currentScene ?? "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Selection: </span>
                <span className="font-mono">
                  {selection.length > 0 ? selection.join(", ") : "—"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Scenes: </span>
                <span className="font-mono">{scenes.length}</span>
              </div>
            </div>
          </section>
        </aside>

        {/* Center: iframe */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 bg-muted/30">
            {embedSrc ? (
              <iframe
                ref={iframeRef}
                src={embedSrc}
                className="h-full w-full border-0"
                title="Grida Embed"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select a preset or load a file to start
              </div>
            )}
          </div>

          {/* Bottom: message log */}
          <div className="h-48 shrink-0 overflow-y-auto border-t bg-muted/20 font-mono text-[11px]">
            <div className="sticky top-0 border-b bg-background/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
              Message log
            </div>
            {log.length === 0 ? (
              <div className="px-3 py-2 text-muted-foreground">
                No messages yet
              </div>
            ) : (
              log.map((entry, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex gap-2 border-b border-border/30 px-3 py-1",
                    entry.dir === "in" ? "bg-blue-500/5" : "bg-orange-500/5"
                  )}
                >
                  <span className="shrink-0 text-muted-foreground">
                    {formatTime(entry.ts)}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 w-6 text-center font-bold",
                      entry.dir === "in" ? "text-blue-500" : "text-orange-500"
                    )}
                  >
                    {entry.dir === "in" ? "\u25C0" : "\u25B6"}
                  </span>
                  <span className="shrink-0 font-semibold">{entry.type}</span>
                  <span className="min-w-0 truncate text-muted-foreground">
                    {JSON.stringify(
                      entry.data,
                      (_, v) =>
                        v instanceof ArrayBuffer
                          ? `[ArrayBuffer ${v.byteLength}B]`
                          : v,
                      0
                    )}
                  </span>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

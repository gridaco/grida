"use client";

import React, { useRef, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ModelSelector } from "./_components/model-selector";
import { PresetSave } from "./_components/preset-save";
import { PresetSelector } from "./_components/preset-selector";
import { PresetShare } from "./_components/preset-share";
import { presets } from "./_data/presets";
import { ModelParams } from "./_components/model-params";
import { Label } from "@/components/ui/label";
import { ChatBox } from "./_components/chatbox";
import { readStreamableValue } from "ai/rsc";
import { Canvas } from "./_components/canvas";
import { generate } from "./generate";

export default function PlaygroundPage() {
  // const [modelId, setModelId] = useState<string | undefined>(undefined);
  // const [modelConfig, setModelConfig] = useState<any>(undefined);
  const [system, setSystem] = useState<string>("");
  const [response, setResponse] = useState<{ html: string } | null | undefined>(
    null
  );
  const [busy, setBusy] = useState(false);
  const generating = useRef(false);

  const onPrompt = (system: string, prompt: string) => {
    generate({ system, prompt }).then(async ({ output }) => {
      for await (const delta of readStreamableValue(output)) {
        // setData(delta as JSONForm);
        setResponse(delta as any);
      }
      generating.current = false;
      setBusy(false);
    });
  };

  return (
    <>
      <div className="h-full min-h-screen flex flex-col">
        <div className="container flex flex-col items-start justify-between space-y-2 py-4 sm:flex-row sm:items-center sm:space-y-0 md:h-16">
          <h2 className="text-lg font-semibold w-full">Prompt Designer</h2>
          <div className="ml-auto flex w-full space-x-2 sm:justify-end">
            <PresetSelector
              presets={presets}
              onValueChange={(preset) => {
                setSystem(preset.system);
              }}
            />
            <PresetSave disabled />
            <div className="flex space-x-2">
              <PresetShare disabled />
            </div>
          </div>
        </div>
        <Separator />
        <div className="flex-1 flex flex-col">
          <div className="container flex-1 py-6 flex gap-4">
            <aside className="flex-1 flex flex-col">
              <div className="flex-1 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-2">
                  <ModelSelector />
                  <ModelParams />
                </div>
                <div className="flex-1 flex flex-col gap-2">
                  <Label className="text-sm text-muted-foreground">
                    System Message
                  </Label>
                  <Textarea
                    placeholder="Describe desired model behaviour"
                    className="flex-1 p-4 h-full"
                    value={system}
                    onChange={(e) => setSystem(e.target.value)}
                  />
                </div>
              </div>
            </aside>
            <aside className="flex-1 flex flex-col gap-4">
              <div className="flex-1">
                <Canvas
                  node={response?.html}
                  className="rounded-xl overflow-hidden border"
                />
              </div>
              <ChatBox
                disabled={busy}
                onValueCommit={(value) => onPrompt(system, value)}
              />
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}

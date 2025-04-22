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
import { type StreamingResponse } from "./schema";
import { Toggle } from "@/components/ui/toggle";
import { CodeIcon } from "@radix-ui/react-icons";
import { ThemedMonacoEditor } from "@/components/monaco";

const systemmsg = (system: string, template?: string, context?: string) => {
  let txt = system;
  if (template) {
    txt += `<template>\n${template}\n</template>`;
  }
  if (context) {
    txt += `<context>\n${context}\n</context>`;
  }
  return txt;
};

export default function PlaygroundPage() {
  // const [modelId, setModelId] = useState<string | undefined>(undefined);
  // const [modelConfig, setModelConfig] = useState<any>(undefined);
  const [isRaw, setIsRaw] = useState(false);
  const [system1, setSystem1] = useState<string>("");
  const [system2, setSystem2] = useState<string>("");
  const [system3, setSystem3] = useState<string>("");

  const systemall = systemmsg(system1, system2, system3);

  const [response, setResponse] = useState<
    StreamingResponse | null | undefined
  >(null);
  const [streamBusy, setStreamBusy] = useState(false);
  const generating = useRef(false);

  const onPrompt = (system: string, prompt: string) => {
    setStreamBusy(true);
    generate({ system, prompt, maxTokens: 16384, temperature: 1 }).then(
      async ({ output }) => {
        for await (const delta of readStreamableValue(output)) {
          // setData(delta as JSONForm);
          setResponse(delta as any);
        }
        generating.current = false;
        setStreamBusy(false);
      }
    );
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
                setSystem1(preset.system);
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
                    className="resize-none flex-1 p-4 h-full"
                    value={system1}
                    onChange={(e) => setSystem1(e.target.value)}
                  />
                </div>
                <div className="flex-1 flex flex-col gap-2">
                  <Label className="text-sm text-muted-foreground">
                    Template Message
                  </Label>
                  <Textarea
                    placeholder="Describe desired model behaviour"
                    className="resize-none flex-1 p-4 h-full"
                    value={system2}
                    onChange={(e) => setSystem2(e.target.value)}
                  />
                </div>
                <div className="flex-1 flex flex-col gap-2">
                  <Label className="text-sm text-muted-foreground">
                    Context Message
                  </Label>
                  <Textarea
                    placeholder="Describe desired model behaviour"
                    className="resize-none flex-1 p-4 h-full"
                    value={system3}
                    onChange={(e) => setSystem3(e.target.value)}
                  />
                </div>
              </div>
            </aside>
            <aside className="flex-[2] flex flex-col gap-4">
              <div className="flex-1 flex flex-col gap-2">
                <div className="flex-1 flex flex-col rounded-xl overflow-hidden border">
                  <header className="flex flex-col gap-1 py-2 px-4 border-b">
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        {response?.name}
                        {response?.width && (
                          <span className="text-muted-foreground text-xs ml-2">
                            {response?.width} x {response?.height}
                          </span>
                        )}
                      </div>
                      <div>
                        <Toggle
                          size="sm"
                          onPressedChange={setIsRaw}
                          pressed={isRaw}
                        >
                          <CodeIcon />
                        </Toggle>
                      </div>
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {response?.description}
                    </div>
                  </header>
                  {isRaw ? (
                    <div className="flex-1 max-w-full">
                      <ThemedMonacoEditor
                        value={JSON.stringify(response, null, 2)}
                        language="json"
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                        }}
                      />
                    </div>
                  ) : (
                    <Canvas node={response?.html} className="flex-1" />
                  )}
                </div>
              </div>
              <ChatBox
                disabled={streamBusy}
                onValueCommit={(value) => onPrompt(systemall, value)}
              />
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}

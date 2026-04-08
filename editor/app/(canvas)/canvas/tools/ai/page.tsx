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
import { Field, FieldLabel } from "@/components/ui/field";
import { MinimalChatBox } from "@/components/chat";
import { readStreamableValue } from "@ai-sdk/rsc";
import { Canvas } from "./_components/canvas";
import { generate, type UserAttachment } from "./generate";
import { type StreamingResponse } from "./schema";
import { Toggle } from "@/components/ui/toggle";
import { CodeIcon } from "@radix-ui/react-icons";
import { ThemedMonacoEditor } from "@/components/monaco";
import { useDummyPublicUpload } from "@/scaffolds/platform/storage";
import { Spinner } from "@/components/ui/spinner";
import { GridaLogo } from "@/components/grida-logo";

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

type UserInput = {
  text: string;
  attachments: UserAttachment[];
};

export default function PlaygroundPage() {
  const [modelId, setModelId] = useState<string | undefined>(undefined);
  // const [modelConfig, setModelConfig] = useState<any>(undefined);
  const [isRaw, setIsRaw] = useState(false);
  const [system1, setSystem1] = useState<string>("");
  const [system2, setSystem2] = useState<string>("");
  const [system3, setSystem3] = useState<string>("");

  const systemall = systemmsg(system1, system2, system3);

  const uploader = useDummyPublicUpload();

  const [response, setResponse] = useState<
    StreamingResponse | null | undefined
  >(null);

  const [streamBusy, setStreamBusy] = useState(false);
  const generating = useRef(false);

  const onPrompt = (system: string, user: UserInput) => {
    setStreamBusy(true);
    generating.current = true;

    generate({ modelId, system, user, maxOutputTokens: 16384, temperature: 1 })
      .then(async ({ output }) => {
        for await (const delta of readStreamableValue(output)) {
          setResponse(delta as any);
        }
      })
      .finally(() => {
        generating.current = false;
        setStreamBusy(false);
      });
  };

  return (
    <>
      <div className="h-full min-h-screen flex flex-col">
        <div className="container max-w-screen-2xl flex flex-col items-start justify-between space-y-2 py-4 sm:flex-row sm:items-center sm:space-y-0 md:h-16">
          <h2 className="text-lg font-semibold w-full">
            <GridaLogo className="inline mr-2" />
            Prompt Designer
          </h2>
          <div className="ml-auto flex w-full space-x-2 sm:justify-end">
            <PresetSelector
              presets={presets}
              onValueChange={(preset) => {
                setSystem1(preset.system);
                setSystem2(preset.expert ?? "");
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
          <div className="container max-w-screen-2xl flex-1 py-6 flex gap-4">
            <aside className="flex-1 flex flex-col">
              <div className="flex-1 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-2">
                  <ModelSelector
                    onValueChange={(model) => {
                      setModelId(model.id);
                    }}
                  />
                  <ModelParams />
                </div>
                <Field className="flex-1">
                  <FieldLabel className="text-sm text-muted-foreground">
                    System Message
                  </FieldLabel>
                  <Textarea
                    placeholder="Describe desired model behaviour"
                    className="resize-none flex-1 p-4 h-full"
                    value={system1}
                    onChange={(e) => setSystem1(e.target.value)}
                  />
                </Field>
                <Field className="flex-1">
                  <FieldLabel className="text-sm text-muted-foreground">
                    Expert Message
                  </FieldLabel>
                  <Textarea
                    placeholder="Describe desired model behaviour"
                    className="resize-none flex-1 p-4 h-full"
                    value={system2}
                    onChange={(e) => setSystem2(e.target.value)}
                  />
                </Field>
                <Field className="flex-1">
                  <FieldLabel className="text-sm text-muted-foreground">
                    Context Message
                  </FieldLabel>
                  <Textarea
                    placeholder="Describe desired model behaviour"
                    className="resize-none flex-1 p-4 h-full"
                    value={system3}
                    onChange={(e) => setSystem3(e.target.value)}
                  />
                </Field>
              </div>
            </aside>
            <aside className="flex-[2] flex flex-col gap-4">
              <div className="flex-1 flex flex-col gap-2">
                <div className="flex-1 flex flex-col rounded-xl overflow-hidden border shadow-lg">
                  <header className="flex flex-col gap-1 py-2 px-4 border-b">
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        {streamBusy && <Spinner className="mr-2" />}
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
              <MinimalChatBox
                disabled={streamBusy}
                uploader={uploader}
                onValueCommit={(value) => onPrompt(systemall, value)}
                accept="image/*"
              />
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}

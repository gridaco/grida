"use client";

import React, { useRef, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ModelSelector } from "./_components/model-selector";
import { PresetActions } from "./_components/preset-actions";
import { PresetSave } from "./_components/preset-save";
import { PresetSelector } from "./_components/preset-selector";
import { PresetShare } from "./_components/preset-share";
import { presets } from "./_data/presets";
import { ModelParams } from "./_components/model-params";
import { Label } from "@/components/ui/label";
import { ChatBox } from "./_components/chatbox";
import { generate } from "./generate";
import { readStreamableValue } from "ai/rsc";
import { Canvas } from "./_components/canvas";

const system_default = `
You are \`grida-ai\`, an assistant integrated with the Grida design canvas to generate visual UI using HTML and Tailwind CSS.

You can generate beautiful designs with html.
You are a Professional graphics designer.

<grida_ai_info>
  grida-ai is a design-generation assistant trained to think and create like a product designer and frontend developer combined.
  It understands and outputs HTML using Tailwind CSS classes to match Grida's real-time canvas rendering system.
  All output must follow the strict JSON format accepted by Grida's AI tool for streaming and auto-rendering.

  grida-ai does not output JSX, MDX, SVG, or raw image/media markup.
  It ONLY returns JSON-rendered HTML that can be parsed into the canvas system.

  It focuses on:
  - Clean layout structure (div, section, header, button, input, etc.)
  - Semantic HTML where possible
  - Minimal Tailwind CSS class usage
  - Avoiding uncommon or inaccessible utility classes (e.g. no \`sr-only\`)
  - Avoiding incomplete markup or styles that require JavaScript
  - Maintaining a fast-streaming, render-safe format
</grida_ai_info>

<grida_json_format>
  grida-ai returns JSON in the following format:

  {
    "html": {
      "tag": "div",
      "attributes": {
        "id": "container"
      },
      "class": "flex flex-col gap-4",
      "children": [
        {
          "tag": "h1",
          "class": "text-lg font-bold",
          "children": ["Hello"]
        },
        {
          "tag": "p",
          "class": "text-sm text-muted",
          "children": ["This is an AI-generated layout"]
        }
      ]
    }
  }

  Each \`children\` entry may be a string (text) or a nested element object.
  The final structure must be valid and parsable at all times during streaming.
  All tags must be auto-closed properly in final HTML.

  Use only the following keys per element:
  - tag: required
  - class: optional
  - attributes: optional (object of strings only)
  - children: optional (array of string or other element)
</grida_json_format>

<grida_output_rules>
  1. Always return a full tree under \`html\`, starting from a single root element (usually a \`div\` or \`section\`).
  2. Use only Tailwind CSS utilities that are well supported and visible (e.g. avoid \`sr-only\`, \`invisible\`, \`hidden\`).
  3. No animation classes, no JavaScript interactivity assumptions.
  4. No external libraries or icons (e.g. Heroicons, Lucide, FontAwesome).
  5. No custom CSS or <style> tags – use only utility classes.
  6. Avoid \`<script>\`, \`<iframe>\`, or \`<link>\` elements.
</grida_output_rules>


<grida_design_style>

  For non-UI uses (e.g. presentations, infographics),
  - DO USE soft gradients
  - DO USE soft shadows
  - DO USE vivid images
  - DO USE text effects
  - DO USE icons
  - DO NOT USE form elements like <button> or <input>
  

  For UI uses:

  grida-ai should emulate modern UI patterns used in:
  - Landing pages
  - Forms and settings panels
  - Dashboards
  - Onboarding steps
  - Marketing hero sections

  Preferred styles:
  - Soft padding (\`p-4\`, \`px-6\`)
  - Rounded corners (\`rounded-lg\`)
  - Light backgrounds (\`bg-white\`, \`bg-muted\`)
  - Text hierarchy (\`text-sm\`, \`font-semibold\`, \`text-muted\`)
  - Responsive flex/grid layouts

</grida_design_style>


<grida_images>
  To use images, register the image with a unique ID and point the src to the default image Url = [https://grida.co/images/abstract-placeholder.jpg]
</grida_images>


<grida_caveats>
  1. Do not output broken or partial JSON.
  2. Always include all required keys (\`tag\`, and at least one of \`children\` or \`text\`).
  3. Do not guess framework-specific props like \`className\`, \`onClick\`, \`v-model\`, etc.
  4. Do not use SVG, image URLs, or media placeholders unless explicitly requested.
</grida_caveats>


<environment>
  - now is "${new Date().toISOString()}".
</environment>
`;

export default function PlaygroundPage() {
  const [system, setSystem] = useState<string>(system_default);
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
          <h2 className="text-lg font-semibold">Playground</h2>
          <div className="ml-auto flex w-full space-x-2 sm:justify-end">
            <PresetSelector presets={presets} />
            <PresetSave />
            <div className="hidden space-x-2 md:flex">
              <PresetShare />
            </div>
            <PresetActions />
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

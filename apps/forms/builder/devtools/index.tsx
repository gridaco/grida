"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useDocument } from "@/builder";
import { readStreamableValue } from "ai/rsc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CaretDownIcon, LightningBoltIcon } from "@radix-ui/react-icons";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { grida } from "@/grida";
import { generate } from "@/app/(dev)/canvas/actions";

export function DevtoolsPanel() {
  const [userprompt, setUserPrompt] = useState("");
  const { state, changeNodeText } = useDocument();
  const [delta, setDelta] = useState<{} | undefined>();

  const generate = useGenerate();

  const textNodes: Array<grida.program.nodes.TextNode> = useMemo(() => {
    return Object.values(state.document.nodes).filter(
      (node) => node.type === "text"
    ) as Array<grida.program.nodes.TextNode>;
  }, [state.document.nodes]);

  const generateTextContents = useCallback(() => {
    const payload = textNodes.map((node) => {
      return {
        id: node.id,
        text: node.text,
      };
    });

    const prompt = `You are an AI in a canvas editor.

Generate new text content for the following text nodes:

\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\`

Additional user provided prompt:
\`\`\`
${userprompt}
\`\`\`

    `;

    generate(prompt, (d) => {
      setDelta(d);
      const { changes } = d as any;
      changes?.forEach((change: { id: string; text: string }) => {
        if (!(change.id && change.text)) return;
        changeNodeText(change.id, change.text);
      });
    });
  }, [changeNodeText, generate, textNodes, userprompt]);

  return (
    <Collapsible>
      <Tabs defaultValue="ai" className="border-t">
        <div className="w-full flex justify-between border-b">
          <div className="w-full">
            <TabsList className="m-2">
              <TabsTrigger value="ai">AI</TabsTrigger>
              <TabsTrigger value="document">Document</TabsTrigger>
            </TabsList>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="icon" className="m-2">
              <CaretDownIcon />
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <TabsContent value="ai" className="h-64 p-2">
            <div className="flex flex-col gap-4">
              <div className="flex gap-4">
                <Input
                  value={userprompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  placeholder="Enter a prompt"
                />
                <Button
                  onClick={() => {
                    generateTextContents();
                  }}
                >
                  <LightningBoltIcon className="me-2" />
                  Generate
                </Button>
              </div>
            </div>
            <div className="overflow-scroll prose prose-sm w-full">
              {delta && (
                <pre className="">{JSON.stringify(delta, null, 2)}</pre>
              )}
            </div>
          </TabsContent>
          <TabsContent
            value="document"
            className="h-64 p-2 overflow-scroll w-full"
          >
            <div className="prose prose-sm w-full">
              <pre className="w-full">{JSON.stringify(textNodes, null, 2)}</pre>
            </div>
          </TabsContent>
        </CollapsibleContent>
      </Tabs>
    </Collapsible>
  );
}

function useGenerate() {
  const streamGeneration = useCallback(
    (prompt: string, streamdelta: (delta: {} | undefined) => void) => {
      generate(prompt).then(async ({ output }) => {
        for await (const delta of readStreamableValue(output)) {
          streamdelta(delta);
        }
      });
    },
    []
  );

  return streamGeneration;
}

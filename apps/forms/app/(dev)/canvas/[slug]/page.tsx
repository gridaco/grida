"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  SidebarRoot,
  SidebarSection,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { SelectedNodeProperties } from "@/scaffolds/sidecontrol/sidecontrol-selected-node";
import { NodeHierarchyList } from "@/scaffolds/sidebar/sidebar-node-hierarchy-list";
import {
  StandaloneDocumentEditor,
  StandaloneDocumentEditorContent,
  CanvasEventTarget,
  CanvasOverlay,
  standaloneDocumentReducer,
  type IDocumentEditorState,
  useDocument,
} from "@/builder";
import docs from "../static";
import { readStreamableValue } from "ai/rsc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CaretDownIcon, LightningBoltIcon } from "@radix-ui/react-icons";
import { generate } from "../actions";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { GridaLogo } from "@/components/grida-logo";
import { grida } from "@/grida";

export default function CanvasPlaygroundPage({
  params,
}: {
  params: { slug: string };
}) {
  const slug = params.slug;
  const [state, dispatch] = useReducer(standaloneDocumentReducer, {
    editable: true,
    // @ts-expect-error
    document: docs[slug].document,
  });

  return (
    <main className="w-screen h-screen overflow-hidden">
      <StandaloneDocumentEditor state={state} dispatch={dispatch}>
        <div className="flex w-full h-full">
          <aside>
            <SidebarRoot>
              <SidebarSection className="mt-4">
                <span>
                  <GridaLogo className="inline-block w-4 h-4 me-2" />
                  <span className="font-bold text-xs">
                    Grida Canvas SDK Playground
                  </span>
                </span>
              </SidebarSection>
              <SidebarSection className="mt-4">
                <ExampleSelection value={slug} />
              </SidebarSection>
              <hr />
              <SidebarSection>
                <SidebarSectionHeaderItem>
                  <SidebarSectionHeaderLabel>Layers</SidebarSectionHeaderLabel>
                </SidebarSectionHeaderItem>
                <NodeHierarchyList />
              </SidebarSection>
            </SidebarRoot>
          </aside>
          <div className="w-full h-full flex flex-col">
            <CanvasEventTarget className="relative w-full h-full no-scrollbar overflow-y-auto bg-transparent pointer-events-none">
              <CanvasOverlay />
              <div className="w-full h-full flex bg-background items-center justify-center">
                <div className="shadow-lg rounded-xl border overflow-hidden">
                  <StandaloneDocumentEditorContent />
                </div>
              </div>
            </CanvasEventTarget>
            <DemoPanel />
          </div>
          <aside className="h-full">
            <SidebarRoot side="right">
              {state.selected_node_id && <SelectedNodeProperties />}
            </SidebarRoot>
          </aside>
        </div>
      </StandaloneDocumentEditor>
    </main>
  );
}

function ExampleSelection({ value }: { value: string }) {
  const router = useRouter();
  return (
    <Select
      defaultValue={value}
      onValueChange={(v) => {
        router.push(`/canvas/${v}`);
      }}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="1">1</SelectItem>
        <SelectItem value="2">2</SelectItem>
      </SelectContent>
    </Select>
  );
}

function DemoPanel() {
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

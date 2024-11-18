"use client";

import React, { useEffect, useReducer } from "react";
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
  initDocumentEditorState,
} from "@/builder";
import docs from "../static";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { GridaLogo } from "@/components/grida-logo";
import { DevtoolsPanel } from "@/builder/devtools";
import { FontFamilyListProvider } from "@/scaffolds/sidecontrol/controls/font-family";

type GoogleFontsV2Response = {
  [key: string]: {
    family: string;
    weights: number[];
    styles: string[];
  };
};

function useGoogleFontsList() {
  const [fonts, setFonts] = React.useState<any[]>([]);
  useEffect(() => {
    fetch(
      "https://s3.us-west-1.amazonaws.com/google.fonts/google-fonts-v2.min.json"
    )
      .then((r) => r.json() as Promise<GoogleFontsV2Response>)
      .then((d) => {
        d &&
          setFonts(
            Object.values(d)
            // load only the first 100 fonts
            // Object.values(d).slice(0, 100)
          );
      });
  }, []);

  return fonts;
}

export default function CanvasPlaygroundPage({
  params,
}: {
  params: { slug: string };
}) {
  const fonts = useGoogleFontsList();
  const slug = params.slug;
  const [state, dispatch] = useReducer(
    standaloneDocumentReducer,
    initDocumentEditorState({
      editable: true,
      // @ts-expect-error
      document: docs[slug].document,
    })
  );

  return (
    <main className="w-screen h-screen overflow-hidden">
      <StandaloneDocumentEditor initial={state} dispatch={dispatch}>
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
            <CanvasEventTarget className="relative w-full h-full no-scrollbar overflow-y-auto bg-transparent">
              <CanvasOverlay />
              <div className="w-full h-full flex bg-background items-center justify-center">
                <div className="shadow-lg rounded-xl border overflow-hidden">
                  <StandaloneDocumentEditorContent />
                </div>
              </div>
            </CanvasEventTarget>
            <DevtoolsPanel />
          </div>
          <aside className="h-full">
            <SidebarRoot side="right">
              <FontFamilyListProvider fonts={fonts}>
                {state.selected_node_id && <SelectedNodeProperties />}
              </FontFamilyListProvider>
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

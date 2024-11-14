"use client";

import React, { useReducer } from "react";
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

export default function CanvasPlaygroundPage({
  params,
}: {
  params: { slug: string };
}) {
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
            <CanvasEventTarget className="relative w-full h-full no-scrollbar overflow-y-auto bg-transparent pointer-events-none">
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

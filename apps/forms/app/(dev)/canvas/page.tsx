"use client";

import React, { useReducer, useState } from "react";
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
} from "@/builder";
import documentjson from "./document";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function CanvasPlaygroundPage() {
  const [state, dispatch] = useReducer(standaloneDocumentReducer, {
    editable: true,
    document: documentjson,
  });

  return (
    <main className="w-screen h-screen overflow-hidden">
      <StandaloneDocumentEditor state={state} dispatch={dispatch}>
        <div className="flex w-full h-full">
          <aside>
            <SidebarRoot>
              <SidebarSection className="mt-4">
                <ExampleSelection />
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
          <div className="w-full h-full">
            <CanvasEventTarget className="relative w-full h-full no-scrollbar overflow-y-auto bg-transparent pointer-events-none">
              <CanvasOverlay />
              <div className="w-full h-full flex bg-background items-center justify-center">
                <div className="shadow-lg rounded-xl border overflow-hidden">
                  <StandaloneDocumentEditorContent />
                </div>
              </div>
            </CanvasEventTarget>
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

function ExampleSelection() {
  return (
    <Select>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="1">1</SelectItem>
      </SelectContent>
    </Select>
  );
}

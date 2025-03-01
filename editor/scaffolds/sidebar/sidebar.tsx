"use client";

import React from "react";
import { useEditorState } from "../editor";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { ModeInsertBlocks } from "./sidebar-mode-insert";
import { ModeDesign } from "./sidebar-mode-design";
import { ModeData } from "./sidebar-mode-data";
import { ModeConnect } from "./sidebar-mode-connect";
import { ModeProject } from "./sidebar-mode-project";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import { GridaLogo } from "@/components/grida-logo";
import { EditableDocumentTitle } from "@/scaffolds/editable-document-title";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SlashIcon } from "@radix-ui/react-icons";
import { DatabaseIcon, HammerIcon, PlugIcon } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { DarwinSidebarHeaderDragArea } from "../desktop";
import Link from "next/link";

export function EditorSidebar() {
  const [state, dispatch] = useEditorState();
  const { insertmenu } = state;

  const onSidebarModeChange = (mode: string) => {
    dispatch({
      type: "editor/sidebar/mode",
      mode: mode as any,
    });
  };

  const onInsertMenuOpenChange = (open: boolean) => {
    dispatch({
      type: "editor/panels/insert-menu",
      open: open,
    });
  };

  if (insertmenu.open) {
    return (
      <Dialog.Root open={insertmenu.open} onOpenChange={onInsertMenuOpenChange}>
        <Dialog.Content>
          <Dialog.Title className="sr-only">Insert Block</Dialog.Title>
          <Dialog.Description className="sr-only">
            Select a block to insert into the canvas
          </Dialog.Description>
          <Sidebar>
            <DarwinSidebarHeaderDragArea />
            <ModeInsertBlocks />
          </Sidebar>
        </Dialog.Content>
      </Dialog.Root>
    );
  }

  return (
    <Sidebar>
      <SidebarHeader className="min-w-60 w-min p-0 gap-0">
        <DarwinSidebarHeaderDragArea />
        <header className="desktop-drag-area h-11 min-h-11 flex items-center px-4 border-b">
          <Link
            href={`/${state.organization.name}/${state.project.name}`}
            prefetch={false}
          >
            <span className="flex items-center gap-2 text-md font-black select-none">
              <GridaLogo size={15} />
            </span>
          </Link>
          <SlashIcon className="min-w-[20px] ms-2" width={15} height={15} />
          <EditableDocumentTitle
            id={state.document_id}
            defaultValue={state.document_title}
          />
        </header>
        <Tabs
          value={state.sidebar.mode}
          onValueChange={onSidebarModeChange}
          className="py-1 px-2"
        >
          <TabsList className="w-full max-w-full bg-sidebar-accent">
            <TabsTrigger value="project">
              <ResourceTypeIcon type="project" className="w-4 h-4" />
            </TabsTrigger>
            <TabsTrigger
              value="build"
              disabled={state.sidebar.mode_build.disabled}
            >
              <HammerIcon className="w-4 h-4" />
            </TabsTrigger>
            <TabsTrigger
              value="data"
              disabled={state.sidebar.mode_data.disabled}
            >
              <DatabaseIcon className="w-4 h-4" />
            </TabsTrigger>
            <TabsTrigger
              value="connect"
              disabled={state.sidebar.mode_connect.disabled}
            >
              <PlugIcon className="w-4 h-4" />
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </SidebarHeader>
      <SidebarContent>
        <Tabs value={state.sidebar.mode}>
          <TabsContent value="project">
            <ModeProject />
          </TabsContent>
          <TabsContent value="build">
            <ModeDesign />
          </TabsContent>
          <TabsContent value="data">
            <ModeData />
          </TabsContent>
          <TabsContent value="connect">
            <ModeConnect />
          </TabsContent>
        </Tabs>
      </SidebarContent>
    </Sidebar>
  );
}

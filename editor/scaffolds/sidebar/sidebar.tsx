"use client";

import React from "react";
import { useEditorState } from "../editor";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
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
import { DarwinSidebarHeaderDragArea } from "../../host/desktop";
import Link from "next/link";
import { ModeDesignForm } from "./sidebar-mode-design-form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function EditorSidebar() {
  const [state, dispatch] = useEditorState();
  const { insertmenu } = state;

  const onSidebarModeChange = (mode: string) => {
    dispatch({
      type: "editor/sidebar/mode",
      mode: mode as any,
    });
  };

  return (
    <Sidebar>
      <SidebarHeader className="min-w-60 w-min p-0 gap-0">
        <DarwinSidebarHeaderDragArea />
        <header className="desktop-drag-area h-11 min-h-11 flex items-center px-4 border-b">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 text-md font-black select-none outline-none">
                <GridaLogo size={15} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="bottom"
              align="start"
              className="min-w-52"
            >
              <Link
                href={`/${state.organization.name}/${state.project.name}`}
                prefetch={false}
              >
                <DropdownMenuItem className="text-xs">
                  Back to Dashboard
                </DropdownMenuItem>
              </Link>
            </DropdownMenuContent>
          </DropdownMenu>
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
              <ResourceTypeIcon type="project" className="size-4" />
            </TabsTrigger>
            <TabsTrigger
              value="build"
              disabled={state.sidebar.mode_build.disabled}
            >
              <HammerIcon className="size-4" />
            </TabsTrigger>
            <TabsTrigger
              value="data"
              disabled={state.sidebar.mode_data.disabled}
            >
              <DatabaseIcon className="size-4" />
            </TabsTrigger>
            <TabsTrigger
              value="connect"
              disabled={state.sidebar.mode_connect.disabled}
            >
              <PlugIcon className="size-4" />
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </SidebarHeader>
      <SidebarContent>
        <Tabs value={state.sidebar.mode} className="h-full">
          <TabsContent value="project" className="h-full">
            <SidebarContent className="h-full">
              <ModeProject />
            </SidebarContent>
          </TabsContent>
          <TabsContent value="build" className="h-full">
            <SidebarContent className="h-full">
              {state.doctype === "v0_form" && <ModeDesignForm />}
              {state.doctype === "v0_canvas" && <ModeDesign />}
              {state.doctype === "v0_site" && <ModeDesign />}
            </SidebarContent>
          </TabsContent>
          <TabsContent value="data" className="h-full">
            <SidebarContent className="h-full">
              <ModeData />
            </SidebarContent>
          </TabsContent>
          <TabsContent value="connect" className="h-full">
            <SidebarContent className="h-full">
              <ModeConnect />
            </SidebarContent>
          </TabsContent>
        </Tabs>
      </SidebarContent>
    </Sidebar>
  );
}

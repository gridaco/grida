"use client";

import React, { useState } from "react";
import { SidebarRoot } from "@/components/sidebar";
import { useEditorState as useWorkbenchEditorState } from "../editor";
import { SideControlDoctypeForm } from "./sidecontrol-doctype-form";
import { SideControlDoctypeSite } from "./sidecontrol-doctype-site";
import { SrcUploaderProvider } from "./controls/src";
import { useDocumentAssetUpload } from "../asset";
import { SideControlDoctypeCanvas } from "./sidecontrol-doctype-canvas";
import { AgentPanel } from "@/components/ai-agent/agent-panel";
import { useCurrentEditor } from "@/grida-canvas-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SettingsIcon, BotIcon } from "lucide-react";

export function SideControl() {
  const [state] = useWorkbenchEditorState();
  const { doctype } = state;
  const { uploadPublic } = useDocumentAssetUpload();
  const editor = useCurrentEditor();
  const [activeTab, setActiveTab] = useState<"properties" | "agent">("properties");

  const srcUploader = (file: File) => {
    return uploadPublic(file).then((a) => ({ src: a.publicUrl }));
  };

  // Only show agent panel for canvas doctype
  const showAgentTab = doctype === "v0_canvas";

  return (
    <SidebarRoot side="right">
      {showAgentTab ? (
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "properties" | "agent")}
          className="h-full flex flex-col"
        >
          <TabsList className="w-full rounded-none border-b">
            <TabsTrigger value="properties" className="flex-1">
              <SettingsIcon className="size-4 mr-2" />
              Properties
            </TabsTrigger>
            <TabsTrigger value="agent" className="flex-1">
              <BotIcon className="size-4 mr-2" />
              Agent
            </TabsTrigger>
          </TabsList>
          <TabsContent value="properties" className="flex-1 overflow-hidden m-0">
            <SrcUploaderProvider uploader={srcUploader}>
              {doctype === "v0_form" && <SideControlDoctypeForm />}
              {doctype === "v0_site" && <SideControlDoctypeSite />}
              {doctype === "v0_canvas" && <SideControlDoctypeCanvas />}
            </SrcUploaderProvider>
          </TabsContent>
          <TabsContent value="agent" className="flex-1 overflow-hidden m-0">
            <AgentPanel editor={editor} className="h-full" />
          </TabsContent>
        </Tabs>
      ) : (
        <SrcUploaderProvider uploader={srcUploader}>
          {doctype === "v0_form" && <SideControlDoctypeForm />}
          {doctype === "v0_site" && <SideControlDoctypeSite />}
          {doctype === "v0_canvas" && <SideControlDoctypeCanvas />}
        </SrcUploaderProvider>
      )}
    </SidebarRoot>
  );
}

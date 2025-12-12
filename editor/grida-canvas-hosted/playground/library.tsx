"use client";

import React from "react";
import { SidebarMenuGrid, SidebarMenuGridItem } from "@/components/sidebar";
import { HoverCard, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { prototypes } from "./widgets";
import { toast } from "sonner";
import { useCurrentEditor } from "@/grida-canvas-react";
import { ButtonIcon } from "@radix-ui/react-icons";

const widgets = [
  "text",
  "rich text",
  "note",
  "image",
  "video",
  "icon",
  "embed",
  "column",
  "row",
  "cards",
  "button",
  "avatar",
  "badge",
  "separator",
];

export function LibraryContent() {
  const editor = useCurrentEditor();

  const onInsertWidget = (type: string) => {
    const pre = (prototypes as any)[type];
    if (!pre) {
      toast.error("Widget not found");
      return;
    }

    // insert widget tree
    editor.commands.insertNode(pre);
  };

  return (
    <>
      <Tabs className="mx-2 my-4 h-full" value="widgets">
        <TabsList>
          <TabsTrigger value="widgets">Widgets</TabsTrigger>
        </TabsList>
        <TabsContent value="widgets" className="h-full overflow-y-scroll">
          <SidebarMenuGrid>
            {widgets.map((type) => {
              return (
                <HoverCard key={type} openDelay={100} closeDelay={100}>
                  {/*  */}
                  <HoverCardTrigger>
                    <SidebarMenuGridItem
                      draggable
                      onClick={() => {
                        onInsertWidget(type);
                      }}
                      className="border rounded-md shadow-sm cursor-pointer text-foreground/50 hover:text-foreground"
                    >
                      {/* <BlockTypeIcon
                  type={block_type}
                  className="p-2 size-8 rounded-sm"
                /> */}
                      <ButtonIcon />
                      <div className="mt-1 w-full text-xs break-words text-center overflow-hidden text-ellipsis">
                        {type}
                      </div>
                    </SidebarMenuGridItem>
                  </HoverCardTrigger>
                </HoverCard>
              );
            })}
          </SidebarMenuGrid>
        </TabsContent>
      </Tabs>
    </>
  );
}

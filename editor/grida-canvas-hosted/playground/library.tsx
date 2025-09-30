"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  SidebarMenuGrid,
  SidebarMenuGridItem,
  SidebarVirtualizedMenuGrid,
} from "@/components/sidebar";
import { HoverCard, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { prototypes } from "./widgets";
import { datatransfer } from "@/grida-canvas/data-transfer";
import { toast } from "sonner";
import { useCurrentEditor } from "@/grida-canvas-react";
import { useLocalStorage } from "@uidotdev/usehooks";
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

  const icons_data = useReflectIconsData();
  const icons = useMemo(() => {
    return (
      Object.keys(icons_data).map((key) => {
        const icondata = icons_data[key];
        const src = reflect_icon_link(icondata);
        return { ...icondata, src, key } satisfies ReflectUIIconData & {
          src: string;
          key: string;
        };
      }) as (ReflectUIIconData & { src: string; key: string })[]
    ).filter((icon) => icon.host === "material");
  }, [icons_data]);

  const shapes = useGridaStdShapes();

  const onInsertWidget = (type: string) => {
    const pre = (prototypes as any)[type];
    if (!pre) {
      toast.error("Widget not found");
      return;
    }

    // insert widget tree
    editor.commands.insertNode(pre);
  };

  const onInsertSvgSrc = (name: string, src: string) => {
    const task = fetch(src, {
      cache: "no-store",
    }).then((res) => {
      // svg content
      res.text().then((svg) => {
        editor.commands.createNodeFromSvg(svg).then((node) => {
          node.$.name = name.split(".svg")[0];
        });
      });
    });

    toast.promise(task, {
      loading: "Loading...",
      success: "Inserted",
      error: "Failed to insert SVG",
    });
  };

  const [tab, setTab] = useLocalStorage(
    "playground-insert-dialog-tab",
    "widgets"
  );

  return (
    <>
      <Tabs className="mx-2 my-4 h-full" value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="widgets">Widgets</TabsTrigger>
          <TabsTrigger value="shapes">Shapes</TabsTrigger>
          <TabsTrigger value="icons">Icons</TabsTrigger>
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
        <TabsContent value="shapes" className="h-full overflow-y-scroll">
          <SidebarMenuGrid>
            {/*  */}
            {shapes.map((item) => {
              const { name, src } = item;
              return (
                <SidebarMenuGridItem
                  key={name}
                  onClick={() => onInsertSvgSrc(name, src)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      datatransfer.key,
                      datatransfer.encode({
                        type: "svg",
                        name: name,
                        src: src,
                      })
                    );
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={name}
                    loading="lazy"
                    className="w-10 h-auto dark:invert"
                  />
                </SidebarMenuGridItem>
              );
            })}
          </SidebarMenuGrid>
        </TabsContent>
        <TabsContent value="icons" className="w-full h-full">
          <SidebarVirtualizedMenuGrid
            columnWidth={70}
            rowHeight={70}
            className="min-h-96"
            gap={4}
            renderItem={({ item }) => {
              const { src, family } = item;
              return (
                <SidebarMenuGridItem
                  onClick={() => onInsertSvgSrc(family, src)}
                  className="border rounded-md shadow-sm cursor-pointer text-foreground/50 hover:text-foreground"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      datatransfer.key,
                      datatransfer.encode({
                        type: "svg",
                        name: family,
                        src: src,
                      })
                    );
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={family}
                    title={family}
                    loading="lazy"
                    className="dark:invert"
                  />
                </SidebarMenuGridItem>
              );
            }}
            items={icons}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

type ReflectUIIconData = {
  host: "material" | "ant-design" | "radix-ui" | "unicons" | (string | {});
  family: string;
  variant: "default" | (string | {});
  default_size: number;
};

function useReflectIconsData() {
  const json = "https://reflect-icons.s3.us-west-1.amazonaws.com/all.json";
  const [icons, setIcons] = useState<{
    [key: string]: ReflectUIIconData;
  }>({});
  useEffect(() => {
    fetch(json).then((res) => {
      res.json().then((data) => {
        setIcons(data);
      });
    });
  }, []);

  return icons;
}

// TODO: use grida library api
function reflect_icon_link(icon: ReflectUIIconData) {
  const base = "https://reflect-icons.s3.us-west-1.amazonaws.com";
  const ext = "svg";
  const { host, family, variant } = icon;
  if (variant === "default") {
    return `${base}/${host}/${family}.${ext}`;
  } else {
    return `${base}/${host}/${family}_${variant}.${ext}`;
  }
}

// TODO: use grida library api
function useGridaStdShapes() {
  const base = "https://grida-std.s3.us-west-1.amazonaws.com/shapes-basic";
  const json = `${base}/info.json`;

  const [shapes, setShapes] = useState<{ name: string; src: string }[]>([]);
  useEffect(() => {
    fetch(json).then((res) => {
      res.json().then((data) => {
        setShapes(
          data.map(({ name }: { name: string }) => ({
            name: name,
            src: `${base}/${name}`,
          }))
        );
      });
    });
  }, []);

  return shapes;
}

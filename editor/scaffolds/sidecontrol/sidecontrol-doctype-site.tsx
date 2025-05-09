"use client";

import React from "react";
import { Align, Selection, Zoom } from "./sidecontrol-node-selection";
import { SidebarSection } from "@/components/sidebar";
import { DocumentProperties } from "./sidecontrol-document-properties";
import { Button } from "@/components/ui/button";
import {
  constraints,
  ThemeEditor,
} from "@/grida-react-canvas-starter-kit/starterkit-theme-editor";
import { Rnd } from "react-rnd";
import { Portal } from "@radix-ui/react-portal";
import { Cross2Icon } from "@radix-ui/react-icons";
import { useDocument } from "@/grida-react-canvas";
import parsecolor from "color-parse";
import { PreviewButton } from "@/grida-react-canvas-starter-kit/starterkit-preview";
import { cn } from "@/components/lib/utils";
import { WorkbenchUI } from "@/components/workbench";
export function SideControlDoctypeSite() {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <header className="h-11 flex items-center px-2 justify-end gap-2">
        <Zoom
          className={cn(
            WorkbenchUI.inputVariants({
              variant: "input",
              size: "xs",
            }),
            "w-auto"
          )}
        />
        <PreviewButton />
      </header>
      {/* <SidebarSection className="mb-4 px-2 flex justify-end">
      </SidebarSection> */}
      <Align />
      <hr />
      <Selection
        empty={
          <div className="mt-4 mb-10">
            <DocumentProperties />
            <div className="mx-2 ">
              <Button
                onClick={() => setOpen(true)}
                size="sm"
                variant="outline"
                className="mt-4 w-full"
              >
                Customize Theme
              </Button>
            </div>
          </div>
        }
      />
      {open && <ThemeEditorPortal onOpenChange={setOpen} />}
    </>
  );
}

function ThemeEditorPortal({
  onOpenChange,
}: {
  // persistanceKey?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const { schemaPutProperty } = useDocument();

  return (
    <Portal className="fixed inset-0 z-50 pointer-events-none">
      <div
        id="rnd-bounds"
        className="fixed top-0 -bottom-56 -inset-x-56 pointer-events-none"
      />
      <div>
        <Rnd
          bounds={"#rnd-bounds"}
          // TODO: make initial position dynamic
          default={{
            x: 80,
            y: 80,
            width: constraints.default.width,
            height: constraints.default.height,
          }}
          minWidth={constraints.min.width}
          minHeight={constraints.min.height}
          maxWidth={constraints.max.width}
          maxHeight={constraints.max.height}
          dragHandleClassName="drag-handle"
          className="pointer-events-auto"
        >
          <div className="w-full h-full border rounded-md overflow-hidden shadow-lg">
            <header className="drag-handle desktop-no-drag cursor-move border-b h-10 bg-sidebar flex items-center justify-between px-1 py-2">
              <span className="text-xs font-semibold px-2">Theme</span>
              <Button
                onClick={() => onOpenChange?.(false)}
                variant="ghost"
                size="icon"
                className="p-0.5 hover:bg-sidebar-accent"
              >
                <Cross2Icon className="size-3.5" />
              </Button>
            </header>
            <ThemeEditor
              onChange={(s) => {
                const cssproperties = Object.entries(s.theme.colors).reduce(
                  (acc: ThemeColorProperties, [key, value]) => {
                    const l = parsecolor(value.light);
                    const d = parsecolor(value.dark);
                    acc.light[value.name] = l.values as [
                      number,
                      number,
                      number,
                    ];
                    acc.dark[value.name] = d.values as [number, number, number];
                    return acc;
                  },
                  {
                    light: {},
                    dark: {},
                  } as ThemeColorProperties
                );

                const propertiescss = `
                .custom{
                  ${Object.entries(cssproperties.light)
                    .map(([key, value]) => `${key}: ${tohslvar(value)};`)
                    .join("\n")}
                }

                .dark .custom {
                  ${Object.entries(cssproperties.dark)
                    .map(([key, value]) => `${key}: ${tohslvar(value)};`)
                    .join("\n")}
                }
                `;

                schemaPutProperty("user-custom-css", {
                  type: "string",
                  default: propertiescss,
                });
                //
              }}
            />
          </div>
        </Rnd>
      </div>
    </Portal>
  );
}

type ThemeColorProperties = {
  light: Record<string, [number, number, number]>;
  dark: Record<string, [number, number, number]>;
};

const tohslvar = (values: [number, number, number]) => {
  return `${values[0]}, ${values[1]}%, ${values[2]}%`;
};

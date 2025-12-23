"use client";

import { useState } from "react";
import { useCurrentEditor, useEditorState } from "@/grida-canvas-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import kolor from "@grida/color";
import { Cross2Icon, FrameIcon } from "@radix-ui/react-icons";
import {
  toolmode_to_toolbar_value,
  toolbar_value_to_cursormode,
  ToolbarToolType,
} from "@/grida-canvas-react-starter-kit/starterkit-toolbar/utils";
import {
  ToolGroupItem,
  ToolIcon,
  ToolsGroup,
} from "@/grida-canvas-react-starter-kit/starterkit-toolbar";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { ColorPicker32FWithOptions } from "@/scaffolds/sidecontrol/controls/color-picker";
import { Toggle, toggleVariants } from "@/components/ui/toggle";
import { PaintBucketIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useContentEditModeMinimalState,
  useToolState,
} from "@/grida-canvas-react/provider";
import { RGBChip } from "@/scaffolds/sidecontrol/controls/utils/paint-chip";
import { ImageToolbar } from "@/grida-canvas-react-starter-kit/starterkit-toolbar/image-toolbar";

export function PlaygroundToolbar() {
  const editor = useCurrentEditor();
  const tool = useToolState();
  const content_edit_mode = useContentEditModeMinimalState();

  const value = toolmode_to_toolbar_value(tool);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="relative" aria-label="Toolbar">
      <ImageToolbar />
      {content_edit_mode?.type === "bitmap" && (
        <div className="relative bottom-2 w-full flex justify-center">
          <BitmapEditModeAuxiliaryToolbar />
        </div>
      )}
      <div className="rounded-full flex gap-4 border bg-background shadow px-4 py-2 pointer-events-auto select-none">
        <ToggleGroupPrimitive.Root
          data-slot="toggle-group"
          onValueChange={(v) => {
            editor.surface.surfaceSetTool(
              toolbar_value_to_cursormode(v as ToolbarToolType)
            );
          }}
          value={value}
          defaultValue="cursor"
          type="single"
          className="flex items-center justify-center gap-1"
        >
          <ToolsGroup
            value={value}
            open={open === "cursor"}
            onOpenChange={(o) => setOpen(o ? "cursor" : null)}
            options={[
              { value: "cursor", label: "Cursor", shortcut: "V" },
              { value: "hand", label: "Hand tool", shortcut: "H" },
              { value: "scale", label: "Scale tool", shortcut: "K" },
            ]}
            onValueChange={(v) => {
              editor.surface.surfaceSetTool(
                toolbar_value_to_cursormode(v as ToolbarToolType)
              );
            }}
          />
          <VerticalDivider />
          <ToolGroupItem
            value={"container" satisfies ToolbarToolType}
            label="Container tool"
            shortcut="A, F"
          >
            <FrameIcon />
          </ToolGroupItem>
          <ToolGroupItem
            value={"text" satisfies ToolbarToolType}
            label="Text tool"
            shortcut="T"
          >
            <ToolIcon type="text" />
          </ToolGroupItem>
          <ToolsGroup
            value={value}
            open={open === "shape"}
            onOpenChange={(o) => setOpen(o ? "shape" : null)}
            options={[
              { value: "rectangle", label: "Rectangle", shortcut: "R" },
              { value: "ellipse", label: "Ellipse", shortcut: "O" },
              { value: "line", label: "Line", shortcut: "L" },
              { value: "polygon", label: "Polygon", shortcut: "Y" },
              { value: "star", label: "Star" },
              { value: "image", label: "Image" },
            ]}
            onValueChange={(v) => {
              editor.surface.surfaceSetTool(
                toolbar_value_to_cursormode(v as ToolbarToolType)
              );
            }}
          />
          <ToolsGroup
            value={value}
            open={open === "draw"}
            onOpenChange={(o) => setOpen(o ? "draw" : null)}
            options={[
              { value: "pencil", label: "Pencil tool", shortcut: "⇧+P" },
              { value: "path", label: "Path tool", shortcut: "P" },
              { value: "brush", label: "Brush tool", shortcut: "B" },
              { value: "eraser", label: "Eraser tool", shortcut: "E" },
            ]}
            onValueChange={(v) => {
              editor.surface.surfaceSetTool(
                toolbar_value_to_cursormode(v as ToolbarToolType)
              );
            }}
          />
          <VerticalDivider />
          <ClipboardColor />
          {/* <VerticalDivider /> */}
          {/* <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="px-3">
                <OpenAILogo className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              sideOffset={16}
              align="end"
              className="w-96"
            >
              <Generate />
            </PopoverContent>
          </Popover> */}
          {/* <Button variant="ghost" className="px-3" onClick={onAddButtonClick}>
            <MixIcon />
          </Button> */}
        </ToggleGroupPrimitive.Root>
      </div>
    </div>
  );
}

function BitmapEditModeAuxiliaryToolbar() {
  const editor = useCurrentEditor();
  const tool = useToolState();

  return (
    <div className="rounded-full flex justify-center items-center gap-2 border bg-background shadow px-3 py-1 pointer-events-auto select-none">
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Toggle
              variant="default"
              pressed={tool.type === "flood-fill"}
              onPressedChange={(pressed) => {
                if (pressed) {
                  editor.surface.surfaceSetTool({ type: "flood-fill" });
                }
              }}
            >
              <PaintBucketIcon className="w-3.5 h-3.5" />
            </Toggle>
          </div>
        </TooltipTrigger>
        <TooltipContent>Paint Bucket (G)</TooltipContent>
      </Tooltip>
      <VerticalDivider />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="p-0.5"
            onClick={editor.surface.surfaceTryExitContentEditMode.bind(editor)}
          >
            <Cross2Icon className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Close</TooltipContent>
      </Tooltip>
    </div>
  );
}

function ClipboardColor() {
  const editor = useCurrentEditor();
  const clipboardColor = useEditorState(editor, (s) => s.user_clipboard_color);

  const color: kolor.colorformats.RGBA32F =
    clipboardColor ?? kolor.colorformats.RGBA32F.BLACK;

  return (
    <Popover>
      <PopoverTrigger
        className={toggleVariants({ variant: "default", size: "default" })}
      >
        <RGBChip
          rgb={{ r: color.r, g: color.g, b: color.b }}
          unit="f32"
          opacity={color.a}
          className="rounded-full border size-5"
        />
      </PopoverTrigger>
      <PopoverContent
        align="center"
        side="bottom"
        sideOffset={16}
        className="p-0"
      >
        <ColorPicker32FWithOptions
          color={color}
          onColorChange={editor.surface.a11ySetClipboardColor.bind(
            editor.surface
          )}
        />
      </PopoverContent>
    </Popover>
  );
}

const VerticalDivider = () => <div className="w-1 h-4 border-r" />;

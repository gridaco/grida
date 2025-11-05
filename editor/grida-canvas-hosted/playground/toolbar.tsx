"use client";

import { useCallback, useMemo, useState } from "react";
import { generate } from "@/app/(dev)/canvas/actions";
import {
  useCurrentEditor,
  useDocumentState,
  useEditorState,
} from "@/grida-canvas-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import grida from "@grida/schema";
import { useMetaEnter } from "@/hooks/use-meta-enter";
import { Cross2Icon, FrameIcon } from "@radix-ui/react-icons";
import { PopoverClose } from "@radix-ui/react-popover";
import { useLocalStorage } from "@uidotdev/usehooks";
import { readStreamableValue } from '@ai-sdk/rsc';
import { CANVAS_PLAYGROUND_LOCALSTORAGE_PREFERENCES_BASE_AI_PROMPT_KEY } from "./k";
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
import { ColorPicker } from "@/scaffolds/sidecontrol/controls/color-picker";
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

function useGenerate() {
  const streamGeneration = useCallback(
    (
      prompt: string,
      streamdelta: (delta: {} | undefined) => void,
      onComplete?: () => void
    ) => {
      generate(prompt)
        .then(async ({ output }) => {
          for await (const delta of readStreamableValue(output)) {
            streamdelta(delta);
          }
        })
        .finally(() => {
          onComplete?.();
        });
    },
    []
  );

  return streamGeneration;
}

function useTextRewriteDemo() {
  const editor = useCurrentEditor();
  const { document } = useDocumentState();
  const [delta, setDelta] = useState<{} | undefined>();
  const [loading, setLoading] = useState(false);
  const [aiSettings] = useLocalStorage<string | undefined>(
    CANVAS_PLAYGROUND_LOCALSTORAGE_PREFERENCES_BASE_AI_PROMPT_KEY,
    undefined
  );

  const generate = useGenerate();

  // TODO: check if text is child of a component or instance.

  const editableTextNodes: Array<grida.program.nodes.TextNode> = useMemo(() => {
    return Object.values(document.nodes).filter(
      (node) => node.type === "text" && node.locked === false
    ) as Array<grida.program.nodes.TextNode>;
  }, [document.nodes]);

  const action = useCallback(
    (userprompt: string) => {
      setLoading(true);
      const payload = editableTextNodes.map((node) => {
        return {
          id: node.id,
          text: node.text,
          maxLength: node.maxLength,
          usermetadata: node.userdata,
        };
      });

      const prompt = `You are an AI in a canvas editor.

Generate new text content for the following text nodes:

\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\`

${
  aiSettings
    ? `
------
Additional developers provided prompt:
\`\`\`
${aiSettings}
\`\`\`
`
    : ""
}

------
Additional user provided prompt:
\`\`\`
${userprompt}
\`\`\`

    `;

      generate(
        prompt,
        (d) => {
          setDelta(d);
          const { changes } = d as any;
          changes?.forEach((change: { id: string; text: string }) => {
            if (!(change.id && change.text)) return;
            editor.commands.changeNodePropertyText(change.id, change.text);
          });
        },
        () => {
          setLoading(false);
        }
      );
    },
    [editor, generate, editableTextNodes]
  );

  return { action, delta, loading };
}

export function PlaygroundToolbar() {
  const editor = useCurrentEditor();
  const tool = useToolState();
  const content_edit_mode = useContentEditModeMinimalState();

  const value = toolmode_to_toolbar_value(tool);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="relative" aria-label="Toolbar">
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

// TODO: have it somewhere else
const defaultColors = {
  red: { r: 255, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 255, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 255, a: 1 },
  yellow: { r: 255, g: 255, b: 0, a: 1 },
  orange: { r: 255, g: 165, b: 0, a: 1 },
  purple: { r: 128, g: 0, b: 128, a: 1 },
  pink: { r: 255, g: 192, b: 203, a: 1 },
  cyan: { r: 0, g: 255, b: 255, a: 1 },
  magenta: { r: 255, g: 0, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  gray: { r: 128, g: 128, b: 128, a: 1 },
  silver: { r: 192, g: 192, b: 192, a: 1 },
  brown: { r: 165, g: 42, b: 42, a: 1 },
  olive: { r: 128, g: 128, b: 0, a: 1 },
  navy: { r: 0, g: 0, b: 128, a: 1 },
  teal: { r: 0, g: 128, b: 128, a: 1 },
  maroon: { r: 128, g: 0, b: 0, a: 1 },
  gold: { r: 255, g: 215, b: 0, a: 1 },
  indigo: { r: 75, g: 0, b: 130, a: 1 },
};

function ClipboardColor() {
  const editor = useCurrentEditor();
  const clipboardColor = useEditorState(editor, (s) => s.user_clipboard_color);

  const color = clipboardColor ?? { r: 0, g: 0, b: 0, a: 1 };

  // TODO:
  // - recent colors
  // - document colors
  // - named colors
  const options = Object.entries(defaultColors).map(([id, color]) => ({
    id,
    color,
  }));

  return (
    <Popover>
      <PopoverTrigger
        className={toggleVariants({ variant: "default", size: "default" })}
      >
        <div
          className="border rounded-full size-5"
          style={{
            background: `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`,
          }}
        />
      </PopoverTrigger>
      <PopoverContent
        align="center"
        side="bottom"
        sideOffset={16}
        className="p-0"
      >
        <ColorPicker
          color={color}
          onColorChange={editor.surface.a11ySetClipboardColor.bind(editor.surface)}
          options={options}
        />
      </PopoverContent>
    </Popover>
  );
}

function Generate() {
  const [userprompt, setUserPrompt] = useState("");
  const { action: textRewrite, loading } = useTextRewriteDemo();
  const ref = useMetaEnter<HTMLTextAreaElement>({
    onSubmit: () => textRewrite(userprompt),
  });

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        readOnly={loading}
        autoFocus
        ref={ref}
        value={userprompt}
        onChange={(e) => setUserPrompt(e.target.value)}
        placeholder="Enter a prompt"
        className="min-h-20"
      />
      <div className="flex justify-end">
        <PopoverClose asChild>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => {
              textRewrite(userprompt);
            }}
          >
            Rewrite ⌘↵
          </Button>
        </PopoverClose>
      </div>
    </div>
  );
}

const VerticalDivider = () => <div className="w-1 h-4 border-r" />;

import React, { useEffect, useMemo, useState } from "react";
import {
  SlashIcon,
  BoxIcon,
  Pencil1Icon,
  CircleIcon,
  CursorArrowIcon,
  HandIcon,
  FrameIcon,
  ImageIcon,
  TextIcon,
  CaretDownIcon,
  EraserIcon,
  StarIcon,
} from "@radix-ui/react-icons";
import { BrushIcon, PenToolIcon, TriangleIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  toolmode_to_toolbar_value,
  toolbar_value_to_cursormode,
  ToolbarToolType,
} from "@/grida-canvas-react-starter-kit/starterkit-toolbar/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  useCurrentEditor,
  useEditorFlagsState,
  useToolState,
} from "@/grida-canvas-react";
import { cn } from "@/components/lib/utils";

export function ToolbarPosition({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "absolute bottom-8 left-0 right-0 flex items-center justify-center z-50 pointer-events-none",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export default function Toolbar() {
  const editor = useCurrentEditor();
  const tool = useToolState();
  const { flags } = useEditorFlagsState();
  const value = toolmode_to_toolbar_value(tool);

  const tools = useMemo(() => {
    const stable: Array<{
      value: ToolbarToolType;
      label: string;
      shortcut?: string;
    }> = [
      { value: "pencil", label: "Pencil tool", shortcut: "⇧+P" },
      { value: "path", label: "Path tool", shortcut: "P" },
    ];

    if (flags.__unstable_brush_tool === "on") {
      stable.push({ value: "brush", label: "Brush tool", shortcut: "B" });
      stable.push({ value: "eraser", label: "Eraser tool", shortcut: "E" });
    }

    return stable;
  }, [flags.__unstable_brush_tool]);

  return (
    <div className="rounded-full flex gap-4 border bg-background shadow px-4 py-2 pointer-events-auto">
      <ToggleGroup
        onValueChange={(v) => {
          editor.setTool(
            v
              ? toolbar_value_to_cursormode(v as ToolbarToolType)
              : { type: "cursor" }
          );
        }}
        value={value}
        defaultValue="cursor"
        type="single"
      >
        <ToolsGroup
          value={value}
          options={[
            { value: "cursor", label: "Cursor", shortcut: "V" },
            { value: "hand", label: "Hand tool", shortcut: "H" },
          ]}
          onValueChange={(v) => {
            editor.setTool(toolbar_value_to_cursormode(v as ToolbarToolType));
          }}
        />
        <VerticalDivider />
        <ToggleGroupItem value={"container" satisfies ToolbarToolType}>
          <FrameIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value={"text" satisfies ToolbarToolType}>
          <ToolIcon type="text" />
        </ToggleGroupItem>
        <ToolsGroup
          value={value}
          options={[
            { value: "rectangle", label: "Rectangle", shortcut: "R" },
            { value: "ellipse", label: "Ellipse", shortcut: "O" },
            { value: "line", label: "Line", shortcut: "L" },
            { value: "polygon", label: "Polygon" },
            { value: "star", label: "Star" },
            { value: "image", label: "Image" },
          ]}
          onValueChange={(v) => {
            editor.setTool(toolbar_value_to_cursormode(v as ToolbarToolType));
          }}
        />
        <ToolsGroup
          value={value}
          options={tools}
          onValueChange={(v) => {
            editor.setTool(toolbar_value_to_cursormode(v as ToolbarToolType));
          }}
        />
      </ToggleGroup>
    </div>
  );
}

const VerticalDivider = () => <div className="w-1 h-4 border-r" />;

export function ToolsGroup({
  value,
  options,
  onValueChange,
}: {
  value: ToolbarToolType;
  options: Array<{ value: ToolbarToolType; label: string; shortcut?: string }>;
  onValueChange?: (value: ToolbarToolType) => void;
}) {
  const [primary, setPrimary] = useState<ToolbarToolType>(
    options.find((o) => o.value === value)?.value ?? options[0].value
  );

  useEffect(() => {
    const v = options.find((o) => o.value === value)?.value;
    if (v) {
      setPrimary(v);
    }
  }, [value, options]);

  return (
    <>
      <ToggleGroupItem value={primary}>
        <ToolIcon type={primary} className="size-4" />
      </ToggleGroupItem>
      {options.length > 1 && (
        <DropdownMenu modal>
          <DropdownMenuTrigger>
            <CaretDownIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" sideOffset={16}>
            {options.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onSelect={() => {
                  setPrimary(option.value);
                  onValueChange?.(option.value);
                }}
                asChild
              >
                <button className="w-full flex items-center gap-2">
                  <ToolIcon type={option.value} className="size-4" />
                  <span>{option.label}</span>
                  {option.shortcut && (
                    <DropdownMenuShortcut>
                      {option.shortcut}
                    </DropdownMenuShortcut>
                  )}
                </button>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}

export function ToolIcon({
  type,
  ...props
}: { type: ToolbarToolType } & React.ComponentProps<typeof CursorArrowIcon>) {
  switch (type) {
    case "cursor":
      return <CursorArrowIcon {...props} />;
    case "hand":
      return <HandIcon {...props} />;
    case "container":
      return <FrameIcon {...props} />;
    case "text":
      return <TextIcon {...props} />;
    case "rectangle":
      return <BoxIcon {...props} />;
    case "ellipse":
      return <CircleIcon {...props} />;
    case "polygon":
      return <TriangleIcon {...props} />;
    case "star":
      return <StarIcon {...props} />;
    case "line":
      return <SlashIcon {...props} />;
    case "pencil":
      return <Pencil1Icon {...props} />;
    case "path":
      return <PenToolIcon {...props} />;
    case "image":
      return <ImageIcon {...props} />;
    case "brush":
      return <BrushIcon {...props} />;
    case "eraser":
      return <EraserIcon {...props} />;
    default:
      return null;
  }
}

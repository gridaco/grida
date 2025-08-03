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
import { BrushIcon, LassoIcon, PenToolIcon, TriangleIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  toolmode_to_toolbar_value,
  toolbar_value_to_cursormode,
  ToolbarToolType,
} from "@/grida-canvas-react-starter-kit/starterkit-toolbar/utils";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import {
  useCurrentEditor,
  useEditorFlagsState,
  useToolState,
} from "@/grida-canvas-react";
import { cn } from "@/components/lib/utils";

export function ToolGroupItem({
  className,
  children,
  label,
  shortcut,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & {
  label?: string;
  shortcut?: string;
}) {
  const content = (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium hover:bg-muted hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none transition-[color,box-shadow] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap h-9 px-2 min-w-9",
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );

  if (!label) {
    return content;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{content}</span>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut ? ` (${shortcut})` : null}
      </TooltipContent>
    </Tooltip>
  );
}

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
      <ToggleGroupPrimitive.Root
        data-slot="toggle-group"
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
        className="flex items-center justify-center gap-1"
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
        <ToolGroupItem
          value={"container" satisfies ToolbarToolType}
          className="aspect-square"
          label="Container tool"
          shortcut="A, F"
        >
          <FrameIcon />
        </ToolGroupItem>
        <ToolGroupItem
          value={"text" satisfies ToolbarToolType}
          className="aspect-square"
          label="Text tool"
          shortcut="T"
        >
          <ToolIcon type="text" />
        </ToolGroupItem>
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
      </ToggleGroupPrimitive.Root>
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
      <ToolGroupItem
        value={primary}
        className="aspect-square"
        label={options.find((o) => o.value === primary)?.label}
        shortcut={options.find((o) => o.value === primary)?.shortcut}
      >
        <ToolIcon type={primary} className="size-4" />
      </ToolGroupItem>
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
    case "lasso":
      return <LassoIcon {...props} />;
    default:
      return null;
  }
}

import React, { useEffect, useState } from "react";
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
} from "@radix-ui/react-icons";
import { PenToolIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  cursormode_to_toolbar_value,
  toolbar_value_to_cursormode,
  ToolbarToolType,
} from "@/grida-react-canvas/toolbar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useEventTarget } from "@/grida-react-canvas/provider";

export default function Toolbar() {
  const { setCursorMode, cursor_mode } = useEventTarget();
  const value = cursormode_to_toolbar_value(cursor_mode);

  return (
    <div className="rounded-full flex gap-4 border bg-background shadow px-4 py-2 pointer-events-auto">
      <ToggleGroup
        onValueChange={(v) => {
          setCursorMode(
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
            setCursorMode(toolbar_value_to_cursormode(v as ToolbarToolType));
          }}
        />
        <VerticalDivider />
        <ToggleGroupItem value={"container" satisfies ToolbarToolType}>
          <ToolIcon type="container" />
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
            { value: "image", label: "Image" },
          ]}
          onValueChange={(v) => {
            setCursorMode(toolbar_value_to_cursormode(v as ToolbarToolType));
          }}
        />
        <ToolsGroup
          value={value}
          options={[
            { value: "pencil", label: "Pencil tool", shortcut: "⇧+P" },
            { value: "path", label: "Path tool", shortcut: "P" },
          ]}
          onValueChange={(v) => {
            setCursorMode(toolbar_value_to_cursormode(v as ToolbarToolType));
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
        <ToolIcon type={primary} className="w-4 h-4" />
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
                  <ToolIcon type={option.value} className="w-4 h-4" />
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
    case "line":
      return <SlashIcon {...props} />;
    case "pencil":
      return <Pencil1Icon {...props} />;
    case "path":
      return <PenToolIcon {...props} />;
    case "image":
      return <ImageIcon {...props} />;
    default:
      return null;
  }
}

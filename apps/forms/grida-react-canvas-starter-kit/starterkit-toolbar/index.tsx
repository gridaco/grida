import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SlashIcon,
  BoxIcon,
  Pencil1Icon,
  CircleIcon,
  CursorArrowIcon,
  HandIcon,
  FrameIcon,
  ImageIcon,
  MixIcon,
  TextIcon,
  CaretDownIcon,
} from "@radix-ui/react-icons";
import { BrushIcon, PenToolIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToolbarToolType } from "@/grida-react-canvas/toolbar";
import { ToggleGroupItem } from "@/components/ui/toggle-group";

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
    case "paint":
      return <BrushIcon {...props} />;
    default:
      return null;
  }
}

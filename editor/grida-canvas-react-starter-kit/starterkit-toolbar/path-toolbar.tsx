import { Cross2Icon } from "@radix-ui/react-icons";
import { ToolIcon } from ".";
import { useCurrentEditor, useToolState } from "@/grida-canvas-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RadiusIcon, SplineIcon, SplinePointerIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function PathToolbar() {
  const tool = useToolState();
  const editor = useCurrentEditor();

  return (
    <div
      aria-label="Path toolbar"
      className="rounded-full flex items-center justify-center gap-2 border bg-background shadow px-3 py-1 pointer-events-auto"
    >
      <ToggleGroup
        type="single"
        size="sm"
        value={tool.type}
        onValueChange={(v) => {
          editor.surfaceSetTool({ type: v as "cursor" | "lasso" | "bend" });
        }}
        className="gap-2"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <ToggleGroupItem
                value="cursor"
                className="rounded-sm aspect-square"
              >
                <SplinePointerIcon className="size-4" />
              </ToggleGroupItem>
            </span>
          </TooltipTrigger>
          <TooltipContent>Cursor (V)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <ToggleGroupItem
                value="lasso"
                className="rounded-sm aspect-square"
              >
                <ToolIcon type="lasso" className="size-4" />
              </ToggleGroupItem>
            </span>
          </TooltipTrigger>
          <TooltipContent>Lasso tool (Q)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <ToggleGroupItem
                value="bend"
                className="rounded-sm aspect-square"
              >
                <SplineIcon className="size-4" />
              </ToggleGroupItem>
            </span>
          </TooltipTrigger>
          <TooltipContent>Bend tool (⌘)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <ToggleGroupItem
                value="width"
                className="rounded-sm aspect-square"
              >
                <RadiusIcon className="size-4" />
              </ToggleGroupItem>
            </span>
          </TooltipTrigger>
          <TooltipContent>Variable Width (⇧ + W)</TooltipContent>
        </Tooltip>
      </ToggleGroup>

      <VerticalDivider />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              editor.surfaceTryExitContentEditMode();
            }}
          >
            <Cross2Icon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Exit path mode (Esc)</TooltipContent>
      </Tooltip>
    </div>
  );
}

const VerticalDivider = () => <div className="w-1 h-4 border-r" />;

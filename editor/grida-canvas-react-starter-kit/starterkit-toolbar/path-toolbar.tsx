import { Cross2Icon } from "@radix-ui/react-icons";
import { ToolIcon } from ".";
import { useCurrentEditor, useToolState } from "@/grida-canvas-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SplinePointerIcon } from "lucide-react";

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
          editor.setTool({ type: v as "cursor" | "lasso" });
        }}
      >
        <ToggleGroupItem value="cursor">
          <SplinePointerIcon className="size-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="lasso">
          <ToolIcon type="lasso" className="size-4" />
        </ToggleGroupItem>
      </ToggleGroup>

      <VerticalDivider />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          editor.tryExitContentEditMode();
        }}
      >
        <Cross2Icon className="size-4" />
      </Button>
    </div>
  );
}

const VerticalDivider = () => <div className="w-1 h-4 border-r" />;

import { WorkbenchUI } from "@/components/workbench";
import cg from "@grida/cg";
import { cn } from "@/components/lib/utils";
import { PaintChip } from "./utils/paint-chip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PropertyLine, PropertyLineLabel } from "../ui";
import InputPropertyNumber from "../ui/number";
import { Cross2Icon } from "@radix-ui/react-icons";

const default_box_shadow: cg.FeGaussianBlur = {
  type: "blur",
  radius: 4,
};

export function FeBlurControl({
  value,
  onValueChange,
}: {
  value?: cg.FeGaussianBlur;
  onValueChange?: (value?: cg.FeGaussianBlur) => void;
}) {
  const onAdd = () => {
    onValueChange?.(default_box_shadow);
  };

  const onRemove = () => {
    onValueChange?.(undefined);
  };

  return (
    <Popover>
      {value ? (
        <PopoverTrigger className="w-full">
          <InputContainer>
            <span className="ms-2 text-start text-xs flex-1">Blur</span>
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="px-1 py-1 me-0.5 text-muted-foreground cursor-pointer"
            >
              <Cross2Icon className="w-3.5 h-3.5" />
            </span>
          </InputContainer>
        </PopoverTrigger>
      ) : (
        <PopoverTrigger className="w-full">
          <div
            className={cn(
              "flex items-center border cursor-default",
              WorkbenchUI.inputVariants({
                size: "xs",
                variant: "paint-container",
              })
            )}
            onClick={onAdd}
          >
            <PaintChip paint={cg.paints.transparent} className="rounded-sm" />
            <span className="ms-2 text-xs">Add</span>
          </div>
        </PopoverTrigger>
      )}

      <PopoverContent align="start" side="right" sideOffset={8}>
        {value && (
          <div className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Blur</PropertyLineLabel>
              <InputPropertyNumber
                mode="fixed"
                value={value.radius}
                onValueCommit={(v) =>
                  onValueChange?.({ ...value, radius: v || 0 })
                }
              />
            </PropertyLine>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function InputContainer({ children }: React.PropsWithChildren<{}>) {
  return (
    <div
      className={cn(
        "flex items-center border cursor-default",
        WorkbenchUI.inputVariants({
          size: "xs",
          variant: "paint-container",
        })
      )}
    >
      {children}
    </div>
  );
}

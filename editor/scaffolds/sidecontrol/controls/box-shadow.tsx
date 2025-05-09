import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkbenchUI } from "@/components/workbench";
import { grida } from "@/grida";
import * as tw from "./k/tailwindcss";
import { cn } from "@/components/lib/utils";
import { PaintChip } from "./utils/paint-chip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PropertyLine, PropertyLineLabel, PropertyNumber } from "../ui";
import { Cross2Icon } from "@radix-ui/react-icons";
import { RGBAColorControl } from "./color";

type BoxShadow = grida.program.cg.BoxShadow;

const default_box_shadow: BoxShadow = {
  color: { r: 0, g: 0, b: 0, a: 0.25 },
  offset: [0, 4],
  blur: 4,
  spread: 0,
};

export function BoxShadowControl({
  value,
  onValueChange,
}: {
  value?: BoxShadow;
  onValueChange?: (value?: BoxShadow) => void;
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
            <PaintChip paint={{ type: "solid", color: value.color }} />
            <span className="ms-2 text-start text-xs flex-1">Shadow</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="px-1 py-1 me-0.5 text-muted-foreground"
            >
              <Cross2Icon className="w-3.5 h-3.5" />
            </button>
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
            <PaintChip paint={grida.program.cg.paints.transparent} />
            <span className="ms-2 text-xs">Add</span>
          </div>
        </PopoverTrigger>
      )}

      <PopoverContent align="start" side="right" sideOffset={8}>
        {value && (
          <div className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Preset</PropertyLineLabel>
              <Select
                value={undefined}
                onValueChange={(key) => {
                  const preset = tw.boxshadow[key as keyof typeof tw.boxshadow];
                  onValueChange?.(preset.value);
                }}
              >
                <SelectTrigger
                  className={WorkbenchUI.inputVariants({ size: "xs" })}
                >
                  <SelectValue placeholder="Preset" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(tw.boxshadow).map((key) => {
                    const shadow =
                      tw.boxshadow[key as keyof typeof tw.boxshadow];
                    return (
                      <SelectItem key={key} value={shadow.class}>
                        {shadow.label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>X</PropertyLineLabel>
              <PropertyNumber
                mode="fixed"
                value={value.offset[0]}
                onValueChange={(v) =>
                  onValueChange?.({
                    ...value,
                    offset: [v || 0, value.offset[1]],
                  })
                }
              />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Y</PropertyLineLabel>
              <PropertyNumber
                mode="fixed"
                value={value.offset[1]}
                onValueChange={(v) =>
                  onValueChange?.({
                    ...value,
                    offset: [value.offset[0], v || 0],
                  })
                }
              />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Blur</PropertyLineLabel>
              <PropertyNumber
                mode="fixed"
                value={value.blur}
                onValueChange={(v) =>
                  onValueChange?.({ ...value, blur: v || 0 })
                }
              />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Spread</PropertyLineLabel>
              <PropertyNumber
                mode="fixed"
                value={value.spread}
                onValueChange={(v) =>
                  onValueChange?.({ ...value, spread: v || 0 })
                }
              />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Spread</PropertyLineLabel>
              <RGBAColorControl
                value={value.color}
                onValueChange={(v) => onValueChange?.({ ...value, color: v })}
              />
            </PropertyLine>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
  // const onChange = (v?: string) => {
  //   onValueChange?.({
  //     ...(value || {}),
  //     boxShadow: v,
  //   });
  // };
  // return (
  // <Select value={value?.boxShadow} onValueChange={onChange}>
  //   <SelectTrigger className={WorkbenchUI.inputVariants({ size: "xs" })}>
  //     <SelectValue placeholder="Select..." />
  //   </SelectTrigger>
  //   <SelectContent>
  //     {Object.keys(tw_boxshadow).map((key) => {
  //       const shadow = tw_boxshadow[key as keyof typeof tw_boxshadow];
  //       return (
  //         <SelectItem key={key} value={shadow.class}>
  //           {shadow.label}
  //         </SelectItem>
  //       );
  //     })}
  //   </SelectContent>
  // </Select>
  // );
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

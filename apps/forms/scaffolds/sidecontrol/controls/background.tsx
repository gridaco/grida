import { WorkbenchUI } from "@/components/workbench";
import { RGBAColorControl } from "./color";
import { grida } from "@/grida";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GradientControl } from "./gradient";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils";
import {
  LinearGradientPaintIcon,
  RadialGradientPaintIcon,
  SolidPaintIcon,
} from "./icons/paint-icon";
import assert from "assert";

export function BackgroundControl({
  value,
  onValueChange,
}: {
  value: grida.program.cg.Paint;
  onValueChange: (value: grida.program.cg.PaintWithoutID) => void;
}) {
  const onTabChange = (type: grida.program.cg.Paint["type"]) => {
    const from = value.type;
    const to = type;

    switch (from) {
      case "solid": {
        switch (to) {
          case "linear_gradient":
          case "radial_gradient": {
            onValueChange({
              type: to,
              // TODO: request gradient id
              stops: [
                { offset: 0, color: value.color },
                { offset: 1, color: value.color },
              ],
            });
            break;
          }
          case "solid": {
            // noop
            break;
          }
        }
      }
      case "linear_gradient":
      case "radial_gradient": {
        assert(
          value.type === "linear_gradient" || value.type === "radial_gradient"
        );

        switch (to) {
          case "solid": {
            onValueChange({
              type: "solid",
              color: value.stops[0].color,
            });
            break;
          }
          case "linear_gradient":
          case "radial_gradient": {
            onValueChange({
              type: to,
              stops: value.stops,
            });
            break;
          }
        }
      }
    }
  };

  return (
    <Popover>
      <PopoverTrigger>color</PopoverTrigger>
      <PopoverContent>
        <Tabs value={value.type} onValueChange={onTabChange as any}>
          <TabsList>
            <TabsTrigger value="solid">
              <SolidPaintIcon active={value.type === "solid"} />
            </TabsTrigger>
            <TabsTrigger value="linear_gradient">
              <LinearGradientPaintIcon
                active={value.type === "linear_gradient"}
              />
            </TabsTrigger>
            <TabsTrigger value="radial_gradient">
              <RadialGradientPaintIcon
                active={value.type === "radial_gradient"}
              />
            </TabsTrigger>
          </TabsList>
          <TabsContent value="solid">
            <RGBAColorControl
              value={(value as any as grida.program.cg.SolidPaint).color}
              onValueChange={(color) => {
                onValueChange({ type: "solid", color: color });
              }}
            />
          </TabsContent>
          <TabsContent value="linear_gradient">
            <GradientControl
              value={value as any as grida.program.cg.LinearGradientPaint}
              onValueChange={onValueChange}
            />
          </TabsContent>
          <TabsContent value="radial_gradient">
            <GradientControl
              value={value as any as grida.program.cg.LinearGradientPaint}
              onValueChange={onValueChange}
            />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

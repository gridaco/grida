import * as SliderPrimitive from "@radix-ui/react-slider";
import * as React from "react";
import { cn } from "@/components/lib/utils";

type TimelineProps = React.ComponentPropsWithoutRef<
  typeof SliderPrimitive.Root
>;

const Timeline = ({ className, ...props }: TimelineProps) => (
  <SliderPrimitive.Root
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-12 w-full grow overflow-hidden rounded bg-muted border-2 border-workbench-accent-yellow" />
    <SliderPrimitive.Thumb className="block h-12 w-0.5 cursor-pointer rounded-none border-0 bg-workbench-accent-red ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-workbench-accent-yellow focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
);

export { Timeline };

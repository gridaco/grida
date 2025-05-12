import { cn } from "@/components/lib/utils";

export function SolidPaintIcon({
  active,
  className,
}: {
  active?: boolean;
  className?: string;
}) {
  return (
    <div
      data-active={active}
      className={cn(
        "w-4 aspect-square rounded-full border shadow",
        "bg-muted",
        "data-[active='true']:border-workbench-accent-sky data-[active='true']:bg-workbench-accent-sky/50",
        className
      )}
    />
  );
}

export function LinearGradientPaintIcon({
  active,
  className,
}: {
  active?: boolean;
  className?: string;
}) {
  return (
    <div
      data-active={active}
      className={cn(
        "w-4 aspect-square rounded-full border shadow bg-gradient-to-b",
        "from-muted-foreground/20 to-muted-foreground/80",
        "data-[active='true']:border-workbench-accent-sky data-[active='true']:from-workbench-accent-sky/20 data-[active='true']:to-workbench-accent-sky/80",
        className
      )}
    />
  );
}

export function RadialGradientPaintIcon({
  active,
  className,
}: {
  active?: boolean;
  className?: string;
}) {
  return (
    <div
      data-active={active}
      className={cn(
        "w-4 aspect-square rounded-full border shadow bg-radial",
        "from-muted-foreground/20 to-muted-foreground/80",
        "data-[active='true']:border-workbench-accent-sky data-[active='true']:from-workbench-accent-sky/20 data-[active='true']:to-workbench-accent-sky/80",
        className
      )}
    />
  );
}

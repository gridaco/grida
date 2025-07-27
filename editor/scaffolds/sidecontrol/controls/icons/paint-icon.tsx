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

export function SweepGradientPaintIcon({
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
        "w-4 aspect-square rounded-full border shadow bg-conic",
        "from-muted-foreground/20 to-muted-foreground/80",
        "data-[active='true']:border-workbench-accent-sky data-[active='true']:from-workbench-accent-sky/20 data-[active='true']:to-workbench-accent-sky/80",
        className
      )}
    />
  );
}

export function DiamondGradientPaintIcon({
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
        "w-4 aspect-square rounded-full border shadow relative overflow-hidden",
        "data-[active='true']:border-workbench-accent-sky",
        className
      )}
    >
      {/* Diamond shape using CSS transform */}
      <div
        className={cn(
          "absolute inset-0 transform rotate-45 scale-75",
          "bg-gradient-to-br from-muted-foreground/20 via-muted-foreground/50 to-muted-foreground/80",
          "data-[active='true']:from-workbench-accent-sky/20 data-[active='true']:via-workbench-accent-sky/50 data-[active='true']:to-workbench-accent-sky/80"
        )}
      />
      {/* Additional diamond overlay for more definition */}
      <div
        className={cn(
          "absolute inset-0 transform rotate-45 scale-50",
          "bg-gradient-to-br from-transparent via-muted-foreground/30 to-transparent",
          "data-[active='true']:via-workbench-accent-sky/30"
        )}
      />
    </div>
  );
}

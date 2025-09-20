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

export function ImagePaintIcon({
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
        "bg-muted",
        "data-[active='true']:border-workbench-accent-sky",
        className
      )}
    >
      {/* Image icon representation */}
      <div className="absolute inset-0 flex items-center justify-center">
        <ImageCircleIcon
          className={cn(
            "w-2.5 h-2.5",
            active ? "text-workbench-accent-sky" : "text-muted-foreground/60"
          )}
        />
      </div>
    </div>
  );
}

function ImageCircleIcon({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <circle cx="7.5" cy="7.5" r="6" strokeWidth={1} stroke="currentColor" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.74922 5.75078C5.74922 4.78385 6.53307 4 7.5 4C8.46693 4 9.25078 4.78385 9.25078 5.75078C9.25078 6.71771 8.46693 7.50156 7.5 7.50156C6.53307 7.50156 5.74922 6.71771 5.74922 5.75078ZM6.64922 5.75078C6.64922 5.28091 7.03013 4.9 7.5 4.9C7.96987 4.9 8.35078 5.28091 8.35078 5.75078C8.35078 6.22065 7.96987 6.60156 7.5 6.60156C7.03013 6.60156 6.64922 6.22065 6.64922 5.75078Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.6818 6.93258L2 8.61438V9.88718L3.98887 7.89831L7.5311 11.6929L8.94113 13.2508H10.155L8.48336 11.4038L11 8.88718L13 10.8872V9.61438L11.3182 7.93258C11.1425 7.75685 10.8575 7.75685 10.6818 7.93258L7.87355 10.7409L4.32895 6.94371C4.24568 6.8545 4.12975 6.80294 4.00774 6.80085C3.88572 6.79875 3.76809 6.84629 3.6818 6.93258Z"
        fill="currentColor"
      />
    </svg>
  );
}

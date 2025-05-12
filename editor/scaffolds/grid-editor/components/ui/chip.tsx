import { Badge } from "@/components/ui/badge";
import { IconButtonDotBadge } from "./dotbadge";
import { cn } from "@/components/lib/utils";
import { CaretDownIcon } from "@radix-ui/react-icons";

export function QueryChip({
  active,
  badge,
  children,
}: React.PropsWithChildren<{
  active?: boolean;
  badge?: boolean;
}>) {
  return (
    <div className="relative">
      {badge && (
        <IconButtonDotBadge
          accent="orange"
          offset={{
            top: -12,
            right: -12,
          }}
        />
      )}
      <Badge
        variant="outline"
        className={cn(
          "text-xs font-normal text-muted-foreground rounded-full ps-2 pe-1 whitespace-nowrap",
          active &&
            "border-workbench-accent-sky text-workbench-accent-sky bg-workbench-accent-sky/10"
        )}
      >
        {children}
        <CaretDownIcon className="size-3 ms-2" />
      </Badge>
    </div>
  );
}

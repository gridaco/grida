import { Badge } from "@/components/ui/badge";
import { IconButtonDotBadge } from "../dotbadge";
import { cn } from "@/utils";
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
          offset={{
            top: -12,
            right: -12,
          }}
        />
      )}
      <Badge
        variant="outline"
        className={cn(
          "text-xs font-normal text-muted-foreground rounded-full ps-2 pe-1",
          active &&
            "border-workbench-accent-1 text-workbench-accent-1 bg-workbench-accent-1/10"
        )}
      >
        {children}
        <CaretDownIcon className="w-3 h-3 ms-2" />
      </Badge>
    </div>
  );
}

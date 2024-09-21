import { Badge } from "@/components/ui/badge";
import { IconButtonDotBadge } from "../dotbadge";
import { cn } from "@/utils";

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
      </Badge>
    </div>
  );
}

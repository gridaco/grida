import { Label } from "@/components/ui/label";
import { cn } from "@/utils";

export function PropertyLine({
  children,
  className,
}: React.PropsWithChildren<{
  className?: string;
}>) {
  return (
    <div
      className={cn("flex items-start justify-between max-w-full", className)}
    >
      {children}
    </div>
  );
}

export function PropertyLineLabel({ children }: React.PropsWithChildren<{}>) {
  return (
    <Label className="text-muted-foreground h-8 min-w-20 w-20 flex items-center text-xs me-4 overflow-hidden">
      <span className="text-ellipsis overflow-hidden">{children}</span>
    </Label>
  );
}

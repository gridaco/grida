import { Label } from "@/components/ui/label";
import { cn } from "@/utils";

export function PropertyLine({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="flex items-start justify-between max-w-full">
      {children}
    </div>
  );
}

export function PropertyLineLabel({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  return (
    <Label
      className={cn(
        "text-muted-foreground h-8 min-w-20 w-20 flex items-center text-xs me-4 overflow-hidden",
        className
      )}
      {...props}
    >
      <span className="text-ellipsis overflow-hidden">{children}</span>
    </Label>
  );
}

/**
 * use for matching the height with the label - useful with `<Switch/>`
 * @returns
 */
export function PropertyLineControlRoot({
  children,
}: React.PropsWithChildren<{}>) {
  return <div className="flex items-center h-8">{children}</div>;
}

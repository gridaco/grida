import { Label } from "@/components/ui/label";

export function PropertyLine({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="flex items-start justify-between max-w-full">
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

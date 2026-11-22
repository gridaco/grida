import type { ComponentProps, ReactNode } from "react";
import { cn } from "@app/ui/lib/utils";

export function SettingsSection({
  title,
  description,
  action,
  className,
  children,
  ...props
}: ComponentProps<"section"> & {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <section className={cn("space-y-5", className)} {...props}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function SettingsGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("divide-y rounded-xl border", className)} {...props} />
  );
}

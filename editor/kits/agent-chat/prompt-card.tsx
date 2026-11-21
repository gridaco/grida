import { cn } from "@app/ui/lib/utils";
import type { ComponentProps } from "react";

/** Floating surface for a request that needs a response above the composer. */
export function AgentPromptCard({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn(
        "grid gap-2 rounded-xl border border-border/70 p-2 text-sm leading-5 font-normal shadow-md shadow-black/10 dark:shadow-black/35",
        className
      )}
    />
  );
}

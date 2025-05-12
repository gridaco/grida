import * as React from "react";
import { cn } from "@/components/lib/utils";
import { getShortcutKey } from "../utils";

export interface ShortcutKeyProps extends React.ComponentProps<"span"> {
  keys: string[];
}

export const ShortcutKey = ({
  ref,
  className,
  keys,
  ...props
}: ShortcutKeyProps) => {
  const modifiedKeys = keys.map((key) => getShortcutKey(key));
  const ariaLabel = modifiedKeys
    .map((shortcut) => shortcut.readable)
    .join(" + ");

  return (
    <span
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-0.5", className)}
      {...props}
      ref={ref}
    >
      {modifiedKeys.map((shortcut) => (
        <kbd
          key={shortcut.symbol}
          className={cn(
            "inline-block min-w-2.5 text-center align-baseline font-sans text-xs font-medium text-[rgb(156,157,160)] capitalize",

            className
          )}
          {...props}
          ref={ref}
        >
          {shortcut.symbol}
        </kbd>
      ))}
    </span>
  );
};

ShortcutKey.displayName = "ShortcutKey";

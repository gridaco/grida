import React from "react";
import { cn } from "@/components/lib/utils";

/**
 * @deprecated
 * @returns
 */
export function SideNavItem({
  disabled,
  children,
}: React.PropsWithChildren<{
  disabled?: boolean;
}>) {
  return (
    <button
      disabled={disabled}
      className={cn(
        "flex items-center gap-2 w-full text-sm text-left font-medium px-4 py-2 bg-transparent hover:bg-neutral-500/10",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
      )}
    >
      {children}
    </button>
  );
}

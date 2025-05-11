import { cva } from "class-variance-authority";

export namespace WorkbenchUI {
  export const inputVariants = cva("rounded-sm w-full", {
    variants: {
      variant: {
        input: "shadow-sm border border-input",
        container: "!px-0 flex items-center gap-2",
        // for paint inputs
        "paint-container": "!p-0.5",
      },
      size: {
        xs: "text-[11px] h-6 px-1.5 min-w-none",
        sm: "text-xs h-8 px-2 min-w-none",
      },
    },
    defaultVariants: {
      variant: "input",
      size: "sm",
    },
  });

  export const selectVariants = cva("", {
    variants: {
      variant: {
        trigger:
          "flex h-8 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      },
      size: {
        sm: "h-8 text-xs",
      },
    },
    defaultVariants: {
      variant: "trigger",
      size: "sm",
    },
  });
}

import { cva, type VariantProps } from "class-variance-authority";

export namespace WorkbenchUI {
  export const inputVariants = cva("rounded w-full", {
    variants: {
      variant: {
        input: "shadow-sm",
        container: "px-0 flex items-center gap-2",
      },
      size: {
        sm: "text-xs h-8 px-2 min-w-none",
        container: "text-xs h-8 min-w-none",
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

  export const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
    {
      variants: {
        variant: {
          default:
            "bg-primary text-primary-foreground shadow hover:bg-primary/90",
          destructive:
            "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
          outline:
            "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
          secondary:
            "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
          ghost: "hover:bg-accent hover:text-accent-foreground",
          link: "text-primary underline-offset-4 hover:underline",
        },
        size: {
          default: "h-9 px-4 py-2",
          sm: "h-8 rounded-md px-3 text-xs",
          lg: "h-10 rounded-md px-8",
          icon: "h-8 w-8 p-1.5",
        },
      },
      defaultVariants: {
        variant: "default",
        size: "default",
      },
    }
  );
}

import { cva } from "class-variance-authority";

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

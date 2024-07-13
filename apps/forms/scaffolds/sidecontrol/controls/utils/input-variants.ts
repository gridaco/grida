import { cva } from "class-variance-authority";

export const inputVariants = cva("shadow-sm rounded border w-full", {
  variants: {
    size: {
      sm: "text-xs h-8 px-2 min-w-none",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

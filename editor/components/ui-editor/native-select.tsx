import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/components/lib/utils";

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "xs" | "default";
};

function NativeSelect({
  className,
  size = "default",
  ...props
}: NativeSelectProps) {
  return (
    <div
      className="group/native-select relative w-fit has-[select:disabled]:opacity-50"
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          "border-input placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 dark:hover:bg-input/50 w-full min-w-0 appearance-none rounded-md border bg-transparent shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed truncate",
          // Default size
          "data-[size=default]:h-9 data-[size=default]:px-3 data-[size=default]:py-2 data-[size=default]:pr-9 data-[size=default]:text-sm",
          // Small size
          "data-[size=sm]:h-8 data-[size=sm]:px-2 data-[size=sm]:py-1.5 data-[size=sm]:pr-8 data-[size=sm]:text-xs",
          // Extra small size
          "data-[size=xs]:h-6 data-[size=xs]:px-1.5 data-[size=xs]:py-1 data-[size=xs]:pr-7 data-[size=xs]:text-[11px]",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          className
        )}
        {...props}
      />
      <ChevronDownIcon
        className={cn(
          "text-muted-foreground pointer-events-none absolute top-1/2 -translate-y-1/2 opacity-50 select-none",
          "group-data-[size=default]/native-select:right-3.5 group-data-[size=default]/native-select:size-4",
          "group-data-[size=sm]/native-select:right-2.5 group-data-[size=sm]/native-select:size-3.5",
          "group-data-[size=xs]/native-select:right-2 group-data-[size=xs]/native-select:size-3"
        )}
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  );
}

function NativeSelectOption({ ...props }: React.ComponentProps<"option">) {
  return <option data-slot="native-select-option" {...props} />;
}

function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn(className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };

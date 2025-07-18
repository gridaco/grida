import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-editor/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { WorkbenchUI } from "@/components/workbench";
import grida from "@grida/schema";
import { cn } from "@/components/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "../controls/utils/toggle-group";
import type { TMixed } from "../controls/utils/types";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function PropertyLine({
  children,
  className,
  hidden,
}: React.PropsWithChildren<{
  className?: string;
  hidden?: boolean;
}>) {
  return (
    <div
      data-hidden={hidden}
      className={cn(
        "group flex items-start justify-between max-w-full data-[hidden='true']:hidden",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PropertyLineLabel({ children }: React.PropsWithChildren<{}>) {
  return (
    <Label className="text-[11px] text-muted-foreground h-6 min-w-16 w-16 flex items-center me-4 overflow-hidden">
      <span className="text-ellipsis overflow-hidden">{children}</span>
    </Label>
  );
}

export function PropertySeparator() {
  return <Separator />;
}

export function PropertyInputContainer({
  children,
  className,
}: React.PropsWithChildren<{
  className?: string;
}>) {
  return (
    <div
      className={cn(
        "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PropertyInput({
  type,
  className,
  icon,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  icon?: React.ReactNode;
}) {
  return (
    <div className="w-full relative">
      {icon && (
        <div className="absolute left-1.5 top-1/2 transform -translate-y-1/2">
          {icon}
        </div>
      )}
      <input
        type={type}
        className={cn(
          "flex w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          WorkbenchUI.inputVariants({ size: "xs" }),
          icon ? "pl-6" : "",
          className
        )}
        {...props}
      />
    </div>
  );
}

export function PropertyTextarea({
  className,
  ...props
}: React.ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      {...props}
      className={cn(WorkbenchUI.inputVariants({ size: "sm" }), className)}
    />
  );
}

export type EnumItem<T extends string> =
  | T
  | {
      icon?: React.ReactNode;
      label?: string;
      value: T;
      disabled?: boolean;
    };

export function enumLabel<T extends string>(e: EnumItem<T>) {
  if (typeof e === "string") return e;
  return e.label ?? e.value;
}

export function enumValue<T extends string>(e: EnumItem<T>) {
  if (typeof e === "string") return e;
  return e.value;
}

export function enumEq<T extends string>(a: EnumItem<T>, b: EnumItem<T>) {
  return enumValue(a) === enumValue(b);
}

export function PropertyEnum<T extends string>({
  enum: enums,
  placeholder,
  value,
  ...props
}: Omit<React.ComponentProps<typeof Select>, "value" | "onValueChange"> & {
  enum: EnumItem<T>[];
  value?: TMixed<T>;
  placeholder?: string;
  onValueChange?: (value: T) => void;
}) {
  const mixed = value === grida.mixed;
  const hasIcon = enums.some((e) => typeof e !== "string" && e.icon);
  return (
    <Select value={mixed ? undefined : value} {...props}>
      <SelectTrigger className={cn(WorkbenchUI.inputVariants({ size: "xs" }))}>
        <SelectValue placeholder={mixed ? "mixed" : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {enums.map((e) => {
          const value = typeof e === "string" ? e : e.value;
          const label = typeof e === "string" ? e : e.label;
          const icon = typeof e === "string" ? undefined : e.icon;
          const disabled = typeof e === "string" ? false : e.disabled;
          return (
            <SelectItem key={value} value={value} disabled={disabled}>
              {hasIcon && icon && <>{icon}</>}
              {label ?? value}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

export function PropertyEnumToggle<T extends string>({
  enum: enums,
  value,
  onValueChange,
  ...props
}: Omit<
  React.ComponentProps<typeof ToggleGroup>,
  "value" | "defaultValue" | "type" | "onValueChange"
> & {
  enum: EnumItem<T>[];
  value?: TMixed<T>;
  onValueChange?: (value: T) => void;
}) {
  const mixed = value === grida.mixed;

  return (
    <ToggleGroup
      type="single"
      value={mixed ? undefined : value}
      {...props}
      onValueChange={(v) => {
        if (!v) return;
        onValueChange?.(v as T);
      }}
    >
      {enums.map((e) => {
        const value = typeof e === "string" ? e : e.value;
        const label = typeof e === "string" ? e : e.label;
        const icon = typeof e === "string" ? undefined : e.icon;
        const disabled = typeof e === "string" ? false : e.disabled;
        return (
          <ToggleGroupItem
            key={value}
            value={value}
            title={label}
            disabled={disabled}
          >
            {icon}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

export function PropertyEnumTabs<T extends string>({
  enum: enums,
  value,
  onValueChange,
  ...props
}: Omit<
  React.ComponentProps<typeof Tabs>,
  "value" | "defaultValue" | "type" | "onValueChange"
> & {
  enum: EnumItem<T>[];
  value?: TMixed<T>;
  onValueChange?: (value: T) => void;
}) {
  const mixed = value === grida.mixed;

  return (
    <Tabs
      value={mixed ? undefined : value}
      {...props}
      onValueChange={(v) => {
        if (!v) return;
        onValueChange?.(v as T);
      }}
      className="w-full"
    >
      <TabsList className="w-full h-7 p-0.5">
        {enums.map((e) => {
          const value = typeof e === "string" ? e : e.value;
          const label = typeof e === "string" ? e : e.label;
          const icon = typeof e === "string" ? undefined : e.icon;
          const hasIcon = typeof e === "string" ? false : !!e.icon;
          const disabled = typeof e === "string" ? false : e.disabled;
          return (
            <TabsTrigger
              key={value}
              value={value}
              title={label}
              disabled={disabled}
              className="text-xs p-0.5"
            >
              {hasIcon && icon && <>{icon}</>}
              {label ?? value}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

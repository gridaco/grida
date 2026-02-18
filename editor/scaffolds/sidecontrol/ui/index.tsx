import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectSeparator,
  SelectValue,
} from "@/components/ui-editor/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { WorkbenchUI } from "@/components/workbench";
import { Button } from "@/components/ui-editor/button";
import { cn } from "@/components/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "../controls/utils/toggle-group";
import type { TMixed } from "../controls/utils/types";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import grida from "@grida/schema";

/**
 * @deprecated use PropertyRow instead
 */
export function PropertyLine({
  children,
  className,
  hidden,
  disabled,
}: React.PropsWithChildren<{
  className?: string;
  hidden?: boolean;
  disabled?: boolean;
}>) {
  return (
    <div
      data-hidden={hidden}
      data-disabled={disabled}
      className={cn(
        "group flex items-start justify-between max-w-full data-[hidden='true']:hidden data-[disabled='true']:opacity-50 data-[disabled='true']:pointer-events-none data-[disabled='true']:cursor-not-allowed",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PropertyLineLabel({
  children,
  className,
  ...props
}: React.ComponentProps<"label">) {
  return (
    <Label
      className={cn(
        "text-[10px] text-muted-foreground h-6 min-w-12 w-12 flex items-center me-4",
        className
      )}
      {...props}
    >
      <span className="text-ellipsis overflow-hidden">{children}</span>
    </Label>
  );
}

export function PropertySection({
  children,
  className,
  hidden,
  ...props
}: React.PropsWithChildren<React.HtmlHTMLAttributes<HTMLDivElement>>) {
  if (hidden) return null;
  return (
    <section className={cn("my-1", className)} {...props}>
      {children}
    </section>
  );
}

export function PropertySectionContent({
  className,
  children,
}: React.PropsWithChildren<{
  className?: string;
}>) {
  return <div className={cn("w-full pb-2", className)}>{children}</div>;
}

export function PropertySectionHeaderItem({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { className?: string }) {
  return (
    <div
      {...props}
      className={cn(
        "relative group/property-section-header h-8",
        "w-full px-4 py-1 my-1 hover:bg-accent hover:text-accent-foreground text-sm font-medium text-foreground data-[muted='true']:text-muted-foreground",
        "text-ellipsis whitespace-nowrap overflow-hidden",
        "flex justify-between items-center",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PropertySectionHeaderLabel({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <span
      className={cn(
        "text-xs text-start font-normal text-muted-foreground overflow-hidden text-ellipsis group-hover/property-section-header:text-accent-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}

export function PropertySectionHeaderActions({
  children,
  className,
  visibleOnHover = false,
}: React.PropsWithChildren<{
  className?: string;
  visibleOnHover?: boolean;
}>) {
  return (
    <span
      className={cn(
        "flex justify-center text-xs font-normal text-muted-foreground",
        visibleOnHover &&
          "invisible group-hover/property-section-header:visible",
        className
      )}
    >
      {children}
    </span>
  );
}

export const PropertySectionHeaderAction = React.forwardRef(
  function PropertySectionHeaderAction(
    {
      children,
      ...props
    }: React.PropsWithChildren<React.ComponentProps<typeof Button>>,
    forwardedRef
  ) {
    return (
      <Button
        ref={forwardedRef as any}
        {...props}
        variant="ghost"
        size="sm"
        className={cn("size-5 p-0", props.className)}
      >
        {children}
      </Button>
    );
  }
);

export function PropertyRows({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col", className)} {...props}>
      {children}
    </div>
  );
}
export const PropertyRow = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    className?: string;
    hidden?: boolean;
    disabled?: boolean;
    focused?: boolean;
  }
>(function PropertyRow(
  { children, className, hidden, disabled, focused, ...props },
  forwardedRef
) {
  return (
    <div
      ref={forwardedRef}
      {...props}
      data-hidden={hidden}
      data-disabled={disabled}
      data-focused={focused}
      className={cn(
        "group flex items-start justify-between max-w-full px-4 py-1 data-[hidden='true']:hidden data-[disabled='true']:opacity-50 data-[disabled='true']:pointer-events-none data-[disabled='true']:cursor-not-allowed data-[focused='true']:bg-accent",
        className
      )}
    >
      {children}
    </div>
  );
});

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
      title?: string;
      group?: string;
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
  tabIndex,
  className,
  renderTriggerValue,
  ...props
}: Omit<React.ComponentProps<typeof Select>, "value" | "onValueChange"> & {
  enum: EnumItem<T>[] | EnumItem<T>[][];
  value?: TMixed<T>;
  placeholder?: string;
  onValueChange?: (value: T) => void;
  tabIndex?: number;
  className?: string;
  /** When set, renders only this in the trigger instead of label (e.g. icon only). */
  renderTriggerValue?: (
    value: T,
    selectedItem: EnumItem<T> | undefined
  ) => React.ReactNode;
}) {
  const mixed = value === grida.mixed;

  // Check if enums is grouped (array of arrays)
  const isGrouped = Array.isArray(enums[0]);

  // Flatten all enum items to check for icons
  const allEnums = isGrouped
    ? (enums as EnumItem<T>[][]).flat()
    : (enums as EnumItem<T>[]);
  const hasIcon = allEnums.some((e) => typeof e !== "string" && e.icon);

  const selectedItem =
    !mixed && value !== undefined
      ? allEnums.find((e) => enumValue(e) === value)
      : undefined;

  return (
    <Select value={mixed ? undefined : value} {...props}>
      <SelectTrigger
        tabIndex={tabIndex}
        className={cn(WorkbenchUI.inputVariants({ size: "xs" }), className)}
      >
        {renderTriggerValue && !mixed && value !== undefined ? (
          renderTriggerValue(value, selectedItem)
        ) : (
          <SelectValue placeholder={mixed ? "mixed" : placeholder} />
        )}
      </SelectTrigger>
      <SelectContent>
        {isGrouped
          ? // Render grouped enum items with separators
            (enums as EnumItem<T>[][]).flatMap((group, gi) => [
              // Add separator before each group except the first
              ...(gi > 0 ? [<SelectSeparator key={`sep-${gi}`} />] : []),
              // Add all items in the group
              ...group.map((e, i) => {
                const value = typeof e === "string" ? e : e.value;
                const label = typeof e === "string" ? e : e.label;
                const icon = typeof e === "string" ? undefined : e.icon;
                const disabled = typeof e === "string" ? false : e.disabled;
                return (
                  <SelectItem
                    key={value ?? `${gi}+${i}`}
                    value={value}
                    disabled={disabled}
                  >
                    {hasIcon && icon && <>{icon}</>}
                    {label ?? value}
                  </SelectItem>
                );
              }),
            ])
          : // Render flat enum items
            (enums as EnumItem<T>[]).map((e) => {
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
  onValueSeeked,
  ...props
}: Omit<
  React.ComponentProps<typeof ToggleGroup>,
  "value" | "defaultValue" | "type" | "onValueChange"
> & {
  enum: EnumItem<T>[];
  value?: TMixed<T>;
  onValueChange?: (value: T) => void;
  onValueSeeked?: (value: T | null) => void;
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
        const hasIcon = typeof e === "string" ? false : !!e.icon;
        return (
          <ToggleGroupItem
            key={value}
            value={value}
            title={label}
            disabled={disabled}
            onMouseEnter={() => onValueSeeked?.(value as T)}
            onMouseLeave={() => onValueSeeked?.(null)}
          >
            {hasIcon && icon ? <>{icon}</> : (label ?? value)}
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
          const title = typeof e === "string" ? undefined : e.title;
          const hasIcon = typeof e === "string" ? false : !!e.icon;
          const disabled = typeof e === "string" ? false : e.disabled;
          return (
            <TabsTrigger
              key={value}
              value={value}
              title={title}
              disabled={disabled}
              className="text-xs p-0.5"
            >
              {hasIcon && icon ? <>{icon}</> : (label ?? value)}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

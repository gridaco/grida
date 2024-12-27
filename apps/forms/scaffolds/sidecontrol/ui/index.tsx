import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { WorkbenchUI } from "@/components/workbench";
import { grida } from "@/grida";
import { TChange } from "@/grida-canvas/action";
import { cn } from "@/utils";
import { TMixed } from "../controls/utils/types";
import { ToggleGroup, ToggleGroupItem } from "../controls/utils/toggle-group";

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
        "flex items-start justify-between max-w-full data-[hidden='true']:hidden",
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
          WorkbenchUI.inputVariants({ size: "sm" }),
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

type EnumItem<T extends string> =
  | T
  | {
      icon?: React.ReactNode;
      label?: string;
      value: T;
    };

export function PropertyEnum<T extends string>({
  enum: enums,
  placeholder,
  value,
  ...props
}: Omit<React.ComponentProps<typeof Select>, "value"> & {
  enum: EnumItem<T>[];
  value?: TMixed<T>;
  placeholder?: string;
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
          return (
            <SelectItem key={value} value={value}>
              {hasIcon && icon && <div className="me-2">{icon}</div>}
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
        return (
          <ToggleGroupItem key={value} value={value} title={label}>
            {icon}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

export function PropertyNumber({
  type = "number",
  placeholder,
  value,
  className,
  onKeyDown,
  onValueChange,
  step = 1,
  ...props
}: Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange" | "value" | "step"
> & {
  type?: "integer" | "number";
  value?: TMixed<number | "">;
  step?: number;
  onValueChange?: (change: TChange<number>) => void;
}) {
  const mixed = value === grida.mixed;

  return (
    <Input
      {...props}
      type={mixed ? "text" : "number"}
      placeholder={placeholder}
      className={cn(WorkbenchUI.inputVariants({ size: "xs" }), className)}
      value={mixed ? "mixed" : value}
      onKeyDown={(e) => {
        onKeyDown?.(e);

        if (e.defaultPrevented) return;

        const multiplier = e.shiftKey ? 10 : 1;
        if (e.key === "ArrowUp") {
          onValueChange?.({ type: "delta", value: step * multiplier });
          e.preventDefault();
        } else if (e.key === "ArrowDown") {
          onValueChange?.({ type: "delta", value: -step * multiplier });
          e.preventDefault();
        }
      }}
      onChange={(e) => {
        const txt = e.target.value;
        const value = type === "integer" ? parseInt(txt) : parseFloat(txt) || 0;
        onValueChange?.({ type: "set", value });
      }}
    />
  );
}

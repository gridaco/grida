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
import { cn } from "@/utils";

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
    <Label className="text-muted-foreground h-8 min-w-16 w-16 flex items-center text-xs me-4 overflow-hidden">
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

type EnumItem = string | { label: string; value: string };

export function PropertyEnum({
  enum: enums,
  placeholder,
  ...props
}: React.ComponentProps<typeof Select> & {
  enum: EnumItem[];
  placeholder?: string;
}) {
  return (
    <Select {...props}>
      <SelectTrigger className={cn(WorkbenchUI.inputVariants({ size: "sm" }))}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {enums.map((e) => {
          const value = typeof e === "string" ? e : e.value;
          const label = typeof e === "string" ? e : e.label;
          return (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

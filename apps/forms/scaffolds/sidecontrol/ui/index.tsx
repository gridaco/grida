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
    <Label className="text-muted-foreground h-8 min-w-20 w-20 flex items-center text-xs me-4 overflow-hidden">
      <span className="text-ellipsis overflow-hidden">{children}</span>
    </Label>
  );
}

export function PropertySeparator() {
  return <Separator />;
}

export function PropertyInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      className={cn(WorkbenchUI.inputVariants({ size: "sm" }), className)}
    />
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

export function PropertyEnum({
  enum: enums,
  ...props
}: React.ComponentProps<typeof Select> & { enum: string[] }) {
  return (
    <Select {...props}>
      <SelectTrigger className={cn(WorkbenchUI.inputVariants({ size: "sm" }))}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {enums.map((e) => (
          <SelectItem key={e} value={e}>
            {e}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

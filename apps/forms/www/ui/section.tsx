import { cn } from "@/utils";

export function Section({
  children,
  className,
  container,
  ...props
}: React.HtmlHTMLAttributes<HTMLDivElement> & {
  container?: boolean;
}) {
  return (
    <div
      {...props}
      className={cn(container ? "container mx-auto" : "", className)}
    >
      {children}
    </div>
  );
}

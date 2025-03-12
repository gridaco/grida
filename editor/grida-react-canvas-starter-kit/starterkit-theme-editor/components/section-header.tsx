import { cn } from "@/utils/cn";

export function SectionHeader({
  className,
  children,
  ...props
}: React.HtmlHTMLAttributes<HTMLDivElement>) {
  return (
    <header className={cn("mb-4 pb-2 border-b", className)} {...props}>
      {children}
    </header>
  );
}

export function SectionHeaderTitle({
  className,
  children,
  ...props
}: React.HtmlHTMLAttributes<HTMLDivElement>) {
  return (
    <h1 className={cn("text-xl font-semibold", className)} {...props}>
      {children}
    </h1>
  );
}

export function SectionHeaderDescription({
  className,
  children,
  ...props
}: React.HtmlHTMLAttributes<HTMLDivElement>) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props}>
      {children}
    </p>
  );
}

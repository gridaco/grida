import { cn } from "@/utils";

export function Ag({
  fontFamily,
  className,
  fontClassName,
  children = "Ag",
}: React.PropsWithChildren<{
  fontFamily?: string;
  fontClassName?: string;
  className?: string;
}>) {
  return (
    <span
      style={{ fontFamily }}
      className={cn("text-center text-3xl", fontClassName, className)}
    >
      {children}
    </span>
  );
}

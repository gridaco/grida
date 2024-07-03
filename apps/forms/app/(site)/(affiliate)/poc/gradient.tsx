import clsx from "clsx";

export function TopBottomFadingGradientOverlay({
  className,
  children,
}: React.PropsWithChildren<{
  className?: string;
}>) {
  return (
    <div className={clsx("relative", className)}>
      {/* Top gradient overlay */}
      <div className="z-50 absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-background to-transparent pointer-events-none" />
      {/* Bottom gradient overlay */}
      <div className="z-50 absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      {/* Content */}
      {children}
    </div>
  );
}

export function HalfHeightGradient() {
  return (
    <div
      className="absolute bottom-0 left-0 w-full h-2/5 z-0"
      style={{
        background:
          "linear-gradient(to top, hsl(var(--foreground)), transparent)",
      }}
    />
  );
}

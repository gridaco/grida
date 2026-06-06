/** Filter-effect glyph — noise. 15×15, portable `currentColor` SVG. */
export default function FeNoiseIcon({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <circle cx="7.5" cy="7.5" r="6" strokeWidth={1} stroke="currentColor" />
      <g fill="currentColor" fillOpacity="0.5">
        <rect x="5" y="5" width="1" height="1" />
        <rect x="4" y="4" width="1" height="1" />
        <rect x="3" y="7" width="1" height="1" />
        <rect x="6" y="11" width="1" height="1" />
        <rect x="7" y="12" width="1" height="1" />
        <rect x="9" y="7" width="1" height="1" />
        <rect x="10" y="6" width="1" height="1" />
        <rect x="5" y="8" width="1" height="1" />
        <rect x="4" y="9" width="1" height="1" />
        <rect x="8" y="3" width="1" height="1" />
        <rect x="9" y="4" width="1" height="1" />
        <rect x="7" y="7" width="1" height="1" />
        <rect x="10" y="10" width="1" height="1" />
        <rect x="9" y="9" width="1" height="1" />
      </g>
    </svg>
  );
}

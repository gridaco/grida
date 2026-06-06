/** Filter-effect glyph — backdrop blur. 15×15, portable `currentColor` SVG. */
export default function FeBackdropBlurIcon({
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
        <circle cx="7.5" cy="7.5" r="0.5" />
        <circle cx="3.5" cy="7.5" r="0.5" />
        <circle cx="1.5" cy="7.5" r="0.5" />
        <circle cx="7.5" cy="13.5" r="0.5" />
        <circle cx="7.5" cy="5.5" r="0.5" />
        <circle cx="3.5" cy="5.5" r="0.5" />
        <circle cx="7.5" cy="11.5" r="0.5" />
        <circle cx="11.5" cy="11.5" r="0.5" />
        <circle cx="7.5" cy="3.5" r="0.5" />
        <circle cx="7.5" cy="1.5" r="0.5" />
        <circle cx="3.5" cy="3.5" r="0.5" />
        <circle cx="3.5" cy="9.5" r="0.5" />
        <circle cx="3.5" cy="11.5" r="0.5" />
        <circle cx="7.5" cy="9.5" r="0.5" />
        <circle cx="11.5" cy="9.5" r="0.5" />
        <circle cx="9.5" cy="7.5" r="0.5" />
        <circle cx="5.5" cy="7.5" r="0.5" />
        <circle cx="9.5" cy="5.5" r="0.5" />
        <circle cx="5.5" cy="5.5" r="0.5" />
        <circle cx="5.5" cy="11.5" r="0.5" />
        <circle cx="9.5" cy="11.5" r="0.5" />
        <circle cx="9.5" cy="3.5" r="0.5" />
        <circle cx="5.5" cy="3.5" r="0.5" />
        <circle cx="5.5" cy="9.5" r="0.5" />
        <circle cx="9.5" cy="9.5" r="0.5" />
        <circle cx="11.5" cy="7.5" r="0.5" />
        <circle cx="13.5" cy="7.5" r="0.5" />
        <circle cx="11.5" cy="5.5" r="0.5" />
        <circle cx="11.5" cy="3.5" r="0.5" />
      </g>
    </svg>
  );
}

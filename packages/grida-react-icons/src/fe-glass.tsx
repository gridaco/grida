/** Filter-effect glyph — glass. 15×15, portable `currentColor` SVG. */
export default function FeGlassIcon({
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
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0.876953 7.49979C0.876953 3.8421 3.8421 0.876953 7.49979 0.876953C11.1575 0.876953 14.1226 3.8421 14.1226 7.49979C14.1226 11.1574 11.1575 14.1226 7.49979 14.1226C3.8421 14.1226 0.876953 11.1574 0.876953 7.49979ZM7.49979 1.82695C4.36677 1.82695 1.82696 4.36677 1.82696 7.49979C1.82696 10.6328 4.36677 13.1726 7.49979 13.1726C10.6328 13.1726 13.1726 10.6328 13.1726 7.49979C13.1726 4.36677 10.6328 1.82695 7.49979 1.82695Z"
        fill="currentColor"
      />
      <path
        d="M8 3C5.23858 3 3 5.23858 3 8H3.71722C3.71722 5.63468 5.63468 3.71721 8 3.71721V3Z"
        fill="currentColor"
      />
      <path
        d="M7 12C9.76142 12 12 9.76142 12 7H11.2828C11.2828 9.36532 9.36532 11.2828 7 11.2828V12Z"
        fill="currentColor"
      />
    </svg>
  );
}

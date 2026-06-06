import type { ComponentProps } from "react";

/**
 * Image paint-type swatch — a small image-placeholder glyph (sun + mountains)
 * centered in a full-opacity outline ring. Shape only: `currentColor`, no
 * fill/frame/state; the host supplies the backing + theme + state. See README.
 */
export default function ImagePaintIcon({
  className,
  ...props
}: ComponentProps<"svg">) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <circle cx={8} cy={8} r={7.5} strokeWidth={1} stroke="currentColor" />
      <ImageGlyph x={3} y={3} width={10} height={10} />
    </svg>
  );
}

function ImageGlyph({ className, ...props }: ComponentProps<"svg">) {
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
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.74922 5.75078C5.74922 4.78385 6.53307 4 7.5 4C8.46693 4 9.25078 4.78385 9.25078 5.75078C9.25078 6.71771 8.46693 7.50156 7.5 7.50156C6.53307 7.50156 5.74922 6.71771 5.74922 5.75078ZM6.64922 5.75078C6.64922 5.28091 7.03013 4.9 7.5 4.9C7.96987 4.9 8.35078 5.28091 8.35078 5.75078C8.35078 6.22065 7.96987 6.60156 7.5 6.60156C7.03013 6.60156 6.64922 6.22065 6.64922 5.75078Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.6818 6.93258L2 8.61438V9.88718L3.98887 7.89831L7.5311 11.6929L8.94113 13.2508H10.155L8.48336 11.4038L11 8.88718L13 10.8872V9.61438L11.3182 7.93258C11.1425 7.75685 10.8575 7.75685 10.6818 7.93258L7.87355 10.7409L4.32895 6.94371C4.24568 6.8545 4.12975 6.80294 4.00774 6.80085C3.88572 6.79875 3.76809 6.84629 3.6818 6.93258Z"
        fill="currentColor"
      />
    </svg>
  );
}

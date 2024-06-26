import React from "react";

export function Html5Icon({
  size,
  color,
}: {
  size: number;
  color: React.CSSProperties["color"];
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4 0L9.13369 57.6218L32.1731 64L55.3058 57.5907L60.4395 0H4ZM14.0631 11.776H31.7665H31.7977H49.4699L48.8166 18.8387H31.7977H31.7665H21.8103L22.4637 26.0726H31.7665H31.7977H48.1787L46.2341 47.7585L31.7977 51.7635V51.8033L17.2989 47.7585L16.3033 36.6666H23.3971L23.8949 42.3137L31.7821 44.4252L39.6537 42.3137L40.4782 33.1353H31.7665V33.1197H15.9921L14.0631 11.776Z"
        fill={color}
      />
    </svg>
  );
}

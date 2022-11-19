import React from "react";

export function Css3Icon({
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
        d="M54.1947 56.4142L59.2001 0.341797H4.2583L9.25833 56.423L31.6956 62.6517L54.1947 56.4142ZM31.7052 11.8059H31.7051H14.4818L15.1071 18.6841L31.7052 18.6841L31.7289 18.6841L41.3972 18.6841L40.7713 25.7274H31.7052V25.7279H15.7206L16.337 32.606H31.729V32.6055H40.1749L39.3765 41.5259L31.7052 43.5964V43.5965L31.6991 43.5981L24.0389 41.5297L23.5492 36.0441H19.8269H16.6447L17.6083 46.8437L31.6976 50.755L31.7293 50.7462V50.7456L45.8057 46.8443L45.9092 45.6823L47.5255 27.5744L47.6933 25.7274L48.935 11.8059H31.7289H31.7052Z"
        fill={color}
      />
    </svg>
  );
}

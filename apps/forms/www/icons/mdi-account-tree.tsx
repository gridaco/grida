export function AccountTreeIcon({
  color,
  size = 30,
}: {
  color?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 30 30"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clip-path="url(#clip0_135_241)">
        <path
          d="M27.5 13.75V3.75H18.75V7.5H11.25V3.75H2.5V13.75H11.25V10H13.75V22.5H18.75V26.25H27.5V16.25H18.75V20H16.25V10H18.75V13.75H27.5ZM8.75 11.25H5V6.25H8.75V11.25ZM21.25 18.75H25V23.75H21.25V18.75ZM21.25 6.25H25V11.25H21.25V6.25Z"
          fill={color ?? "currentColor"}
        />
      </g>
      <defs>
        <clipPath id="clip0_135_241">
          <rect width="30" height="30" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

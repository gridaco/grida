export function ApiIcon({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 30 30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#clip0_135_244)">
        <path
          d="M17.5 15L15 17.5L12.5 15L15 12.5L17.5 15ZM15 7.5L17.65 10.15L20.775 7.025L15 1.25L9.225 7.025L12.35 10.15L15 7.5ZM7.5 15L10.15 12.35L7.025 9.225L1.25 15L7.025 20.775L10.15 17.65L7.5 15ZM22.5 15L19.85 17.65L22.975 20.775L28.75 15L22.975 9.225L19.85 12.35L22.5 15ZM15 22.5L12.35 19.85L9.225 22.975L15 28.75L20.775 22.975L17.65 19.85L15 22.5Z"
          fill="currentColor"
        />
      </g>
      <defs>
        <clipPath id="clip0_135_244">
          <rect width="30" height="30" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

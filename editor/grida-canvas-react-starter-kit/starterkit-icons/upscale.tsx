import * as React from "react";

export const UpscaleIcon = ({ ...props }: React.SVGProps<SVGSVGElement>) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      {...props}
    >
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M16 3h5v5M17 21h2a2 2 0 0 0 2-2M21 12v3M21 3l-5 5M3 7V5a2 2 0 0 1 2-2M9 3h3M12 11H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1Z"
      />
    </svg>
  );
};

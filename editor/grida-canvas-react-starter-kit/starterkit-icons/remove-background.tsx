import * as React from "react";

export const RemoveBackgroundIcon = ({
  ...props
}: React.SVGProps<SVGSVGElement>) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="25"
      height="25"
      viewBox="0 0 24 24"
      fill="none"
      {...props}
    >
      <path
        fill="currentColor"
        d="M2 20v-1.667h2V20a1 1 0 0 0 1 1v2a3 3 0 0 1-3-3Zm18 0v-1.667h2V20a3 3 0 0 1-3 3v-2a1 1 0 0 0 1-1ZM4 13.667V17H2v-3.333h2Zm18 0V17h-2v-3.333h2ZM4 9v3.333H2V9h2Zm18 0v3.333h-2V9h2ZM2 6a3 3 0 0 1 3-3h1.667v2H5a1 1 0 0 0-1 1v1.667H2V6Zm18 0a1 1 0 0 0-1-1h-1.667V3H19a3 3 0 0 1 3 3v1.667h-2V6Zm-8.667-3v2H8V3h3.333ZM16 3v2h-3.333V3H16Z"
      />
      <circle cx="12" cy="13" r="3" stroke="currentColor" stroke-width="2" />
      <path stroke="currentColor" stroke-width="2" d="M18 22a6 6 0 0 0-12 0" />
      <path
        fill="currentColor"
        d="M21.5 0a.5.5 0 0 1 .5.5v1A1.5 1.5 0 0 0 23.5 3h1a.5.5 0 0 1 0 1h-1A1.5 1.5 0 0 0 22 5.5v1a.5.5 0 0 1-1 0v-1A1.5 1.5 0 0 0 19.5 4h-1a.5.5 0 0 1 0-1h1A1.5 1.5 0 0 0 21 1.5v-1a.5.5 0 0 1 .5-.5Z"
      />
    </svg>
  );
};

import React from "react";

export function UnsplashLogoIcon({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="800"
      height="800"
      fill="none"
      viewBox="0 0 24 24"
      className={className}
      {...props}
    >
      <path
        fill="currentColor"
        d="M15 4.5H9v4h6v-4ZM4 10.5h5v4h6v-4h5v9H4v-9Z"
      />
    </svg>
  );
}

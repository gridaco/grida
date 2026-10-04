import React from "react";

export default function UnityLogo({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="27"
      viewBox="0 0 87 97"
      fill="currentColor"
      className={className}
      {...props}
    >
      <path d="M47.137 17.29l15.3 8.83c.55.31.57 1.17 0 1.48l-18.18 10.5c-.55.32-1.2.3-1.71 0l-18.18-10.5c-.56-.3-.57-1.18 0-1.48l15.29-8.83V0L.617 22.54v45.08l14.97-8.64V41.32c-.01-.63.73-1.08 1.28-.74l18.18 10.5c.55.32.86.89.86 1.48v20.99c.01.63-.73 1.08-1.28.74l-15.3-8.83-14.97 8.64 39.04 22.54 39.04-22.54-14.97-8.64-15.3 8.83c-.54.33-1.3-.1-1.28-.74V52.56c0-.63.35-1.19.86-1.48l18.18-10.5c.54-.33 1.3.09 1.28.74v17.66l14.97 8.64V22.54L47.137 0v17.29Z" />
    </svg>
  );
}

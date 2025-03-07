import React from "react";

export const Windows = ({ className }: { className?: string }) => {
  return (
    <svg
      viewBox="0 0 512 512"
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      fill="currentColor"
      className={className}
    >
      <path d="M0 0h230v230H0zm282 0h230v230H282zM0 282h230v230H0zm282 0h230v230H282z" />{" "}
    </svg>
  );
};

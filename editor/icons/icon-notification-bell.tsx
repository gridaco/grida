import React from "react";
import { IconProps, width, height } from "./icon-props";

export function NotificationBellIcon({
  size = 24,
  color = "black",
}: IconProps) {
  return (
    <svg
      width={width(size)}
      height={height(size)}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 20.3335C12.9166 20.3335 13.6666 19.5835 13.6666 18.6668H10.3333C10.3333 19.5835 11.0833 20.3335 12 20.3335ZM17 15.3335V11.1668C17 8.6085 15.6416 6.46683 13.25 5.90016V5.3335C13.25 4.64183 12.6916 4.0835 12 4.0835C11.3083 4.0835 10.75 4.64183 10.75 5.3335V5.90016C8.36665 6.46683 6.99998 8.60016 6.99998 11.1668V15.3335L5.33331 17.0002V17.8335H18.6666V17.0002L17 15.3335ZM15.3333 16.1668H8.66665V11.1668C8.66665 9.10016 9.92498 7.41683 12 7.41683C14.075 7.41683 15.3333 9.10016 15.3333 11.1668V16.1668Z"
        fill={color}
      />
    </svg>
  );
}

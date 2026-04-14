import React, { useEffect, useState } from "react";

export const useClickedOutside = (ref: React.RefObject<HTMLElement | null>) => {
  const [active, setActive] = useState<boolean>(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setActive(true);
      } else {
        setActive(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [ref]);

  return active;
};

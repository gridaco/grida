import { useEffect, useState } from "react";

export const useWindowWidth = () => {
  if (process.browser) {
    const [width, setWidth] = useState(window.innerWidth);
    const handleResize = () => setWidth(window.innerWidth);
    useEffect(() => {
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, [width]);
    return width;
  }
  return 0;
};

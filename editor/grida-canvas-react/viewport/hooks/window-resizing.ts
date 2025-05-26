import { useEffect, useState } from "react";

export function useIsWindowResizing() {
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout;

    const handleResizeStart = () => {
      setIsResizing(true);

      // Clear the timeout to ensure the overlay doesn't reappear prematurely
      clearTimeout(resizeTimeout);

      // Set a timeout to detect when resizing ends
      resizeTimeout = setTimeout(() => {
        setIsResizing(false);
      }, 300); // 300ms delay after resize ends
    };

    window.addEventListener("resize", handleResizeStart);

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener("resize", handleResizeStart);
    };
  }, []);

  return isResizing;
}

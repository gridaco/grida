import { useEffect } from "react";

/**
 * A custom React hook to disable horizontal swipe back navigation
 * by setting `overscroll-behavior-x: none` on the `html` and `body` elements.
 *
 * @example
 * useDisableSwipeBack();
 */
export default function useDisableSwipeBack() {
  useEffect(() => {
    // Store original styles to restore later
    const originalHtmlStyle =
      document.documentElement.style.overscrollBehaviorX;
    const originalBodyStyle = document.body.style.overscrollBehaviorX;

    // Apply `overscroll-behavior-x: none`
    document.documentElement.style.overscrollBehaviorX = "none";
    document.body.style.overscrollBehaviorX = "none";

    return () => {
      // Restore original styles
      document.documentElement.style.overscrollBehaviorX =
        originalHtmlStyle || "";
      document.body.style.overscrollBehaviorX = originalBodyStyle || "";
    };
  }, []);
}

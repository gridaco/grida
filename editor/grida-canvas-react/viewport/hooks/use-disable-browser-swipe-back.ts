import { useEffect } from "react";

/**
 * A custom React hook to disable horizontal swipe back navigation
 * by setting `overscroll-behavior-x: none` on the `html` and `body` elements.
 *
 * This is required on macOS devices with Chrome, where as setting the overscroll x on the event target is not enough to completely prevent the swipe-back gesture.
 * This forces the style on the root (html / body).
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

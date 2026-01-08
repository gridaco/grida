import { useEffect } from "react";
import { useRouter } from "next/navigation";

// <search>
// "Leave site?" (chrome default)
// "Changes you made may not be saved." (chrome default)

/**
 * Hook to warn users about unsaved changes when leaving the page
 * @param isDirty - Function that returns whether there are unsaved changes
 * @param message - Optional custom warning message
 */
export function useUnsavedChangesWarning(
  isDirty: () => boolean,
  message = "You have unsaved changes. Are you sure you want to leave?"
) {
  const router = useRouter();

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty()) {
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    // Handle Next.js App Router navigation
    const handleNavigation = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a[href]");

      if (!link) return;

      const targetAttr = link.getAttribute("target");
      const isModifiedClick =
        e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;

      // Only warn when navigating within the current tab/window
      if (
        isDirty() &&
        !isModifiedClick &&
        (!targetAttr || targetAttr === "_self") &&
        !window.confirm(message)
      ) {
        e.preventDefault();
        router.push(window.location.href);
      }
    };

    document.addEventListener("click", handleNavigation);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleNavigation);
    };
  }, [isDirty, message, router]);
}

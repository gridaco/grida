import { useEffect, useRef } from "react";

type UseMetaEnterOptions = {
  onSubmit: () => void;
};

export function useMetaEnter<T extends HTMLElement>({
  onSubmit,
}: UseMetaEnterOptions) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMetaEnter =
        (event.metaKey || event.ctrlKey) && event.key === "Enter";

      if (isMetaEnter) {
        event.preventDefault(); // Prevent default behavior if necessary
        onSubmit();
      }
    };

    const element = ref.current;
    if (element) {
      element.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      if (element) {
        element.removeEventListener("keydown", handleKeyDown);
      }
    };
  }, [onSubmit]);

  return ref;
}

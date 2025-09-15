import * as React from "react";

/**
 * Hook to track which option is currently being sought via keyboard/mouse interaction
 * @param ref - Reference to the container element
 * @param onValueSeeked - Callback when the sought value changes
 * @param dataKey - The data attribute key to query (e.g., 'selected', 'highlighted')
 *
 * @see https://github.com/radix-ui/primitives/issues/3666
 */
export function useValueSeekedSelector(
  ref: React.RefObject<HTMLElement | null>,
  onValueSeeked?: (option: string | null) => void,
  dataKey: string = "selected"
) {
  const [soughtValue, setSoughtValue] = React.useState<string | null>(null);
  const enabled = onValueSeeked !== undefined;

  // Sync the current sought value by querying the DOM
  const sync = React.useCallback(() => {
    if (!enabled) return;
    requestAnimationFrame(() => {
      const active = ref.current?.querySelector<HTMLElement>(
        `[data-${dataKey}=true]`
      );
      const value = active?.getAttribute("data-value");
      setSoughtValue(value ?? null);
    });
  }, [ref, dataKey, enabled]);

  // Notify parent when sought value changes
  React.useEffect(() => {
    onValueSeeked?.(soughtValue);
  }, [soughtValue, onValueSeeked]);

  return {
    sync,
  };
}

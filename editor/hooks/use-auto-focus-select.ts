import { useRef, useEffect, useState, useCallback } from "react";

/**
 * A versatile hook for input components that provides auto-focus, auto-select, and optional query separation.
 *
 * @example
 * // For search inputs (like font picker)
 * const { value, query, handleInputChange } = useAutoFocusSelect({
 *   initialValue: "Arial",
 *   autoFocus: true,
 *   onQueryChange: (query) => {
 *     // Filter results based on query
 *   }
 * });
 *
 * @example
 * // For normal inputs (ignore query)
 * const { value, handleInputChange } = useAutoFocusSelect({
 *   initialValue: "John Doe",
 *   autoFocus: true
 * });
 *
 * @example
 * // For form inputs with auto-focus only
 * const { value, handleInputChange } = useAutoFocusSelect({
 *   initialValue: "",
 *   autoFocus: true
 * });
 */
interface UseAutoFocusSelectOptions {
  /**
   * The initial display value that should be auto-selected on focus
   */
  initialValue: string;
  /**
   * Whether the input should auto-focus when mounted
   */
  autoFocus?: boolean;
  /**
   * Optional callback when the query value changes (only for search inputs)
   * For normal inputs, you can ignore this and the query return value
   */
  onQueryChange?: (query: string | undefined) => void;
}

interface UseAutoFocusSelectReturn {
  /**
   * The current display value (what shows in the input)
   */
  value: string;
  /**
   * The current query value (what's used for filtering, undefined initially)
   * For normal inputs, you can ignore this value
   */
  query: string | undefined;
  /**
   * Function to update the input value
   */
  setValue: (value: string) => void;
  /**
   * Whether the input is in its initial state (showing display text)
   */
  isInitialState: boolean;
  /**
   * Function to handle input changes
   */
  handleInputChange: (value: string) => void;
  /**
   * Function to handle focus events
   */
  handleFocus: () => void;
  /**
   * Function to handle blur events
   */
  handleBlur: () => void;
  /**
   * Function to handle key down events for auto-focus
   */
  handleKeyDown: (event: React.KeyboardEvent) => void;
}

export function useAutoFocusSelect({
  initialValue,
  autoFocus = true,
  onQueryChange,
}: UseAutoFocusSelectOptions): UseAutoFocusSelectReturn {
  const [value, setValueState] = useState(initialValue);
  const [query, setQueryState] = useState<string | undefined>(undefined);
  const [isInitialState, setIsInitialState] = useState(true);
  const [hasFocused, setHasFocused] = useState(false);
  const [shouldAutoSelect, setShouldAutoSelect] = useState(false);

  const setValue = useCallback((newValue: string) => {
    setValueState(newValue);
  }, []);

  const handleInputChange = useCallback(
    (newValue: string) => {
      setValueState(newValue);

      // If user starts typing, we're no longer in initial state
      if (isInitialState && newValue !== initialValue) {
        setIsInitialState(false);
        // Set the query value when user starts typing
        setQueryState(newValue);
        onQueryChange?.(newValue);
      } else if (!isInitialState) {
        // User is continuing to type
        setQueryState(newValue);
        onQueryChange?.(newValue);
      }
    },
    [isInitialState, initialValue, onQueryChange]
  );

  const handleFocus = useCallback(() => {
    if (!hasFocused && isInitialState) {
      // Mark that we should auto-select on next render
      setShouldAutoSelect(true);
      setHasFocused(true);
    }
  }, [hasFocused, isInitialState]);

  const handleBlur = useCallback(() => {
    // Reset focus state when input loses focus
    setHasFocused(false);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Auto-select all text when user starts typing
      if (shouldAutoSelect && isInitialState) {
        const target = event.target as HTMLInputElement;
        if (target) {
          target.select();
          setShouldAutoSelect(false);
        }
      }
    },
    [shouldAutoSelect, isInitialState]
  );

  // Auto-focus effect using a different approach
  useEffect(() => {
    if (autoFocus) {
      const timer = setTimeout(() => {
        // Find the command input element and focus it
        const commandInput = document.querySelector(
          '[data-slot="command-input"]'
        ) as HTMLInputElement;
        if (commandInput) {
          commandInput.focus();
          if (isInitialState) {
            commandInput.select();
          }
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [autoFocus, isInitialState]);

  // Update value when initialValue changes
  useEffect(() => {
    setValueState(initialValue);
    setQueryState(undefined);
    setIsInitialState(true);
    setHasFocused(false);
    setShouldAutoSelect(false);
  }, [initialValue]);

  return {
    value,
    query,
    setValue,
    isInitialState,
    handleInputChange,
    handleFocus,
    handleBlur,
    handleKeyDown,
  };
}

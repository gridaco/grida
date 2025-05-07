import { useState } from "react";

type Fn = (...args: any[]) => any;

/**
 * State for managing a pending callback
 */
interface PendingCallbackState<T extends Fn = Fn> {
  /** The callback function to be executed */
  callback: T | null;
  /** Whether the callback is currently being executed */
  isExecuting: boolean;
}

/**
 * Handlers for managing a pending callback
 */
interface PendingCallbackHandlers<T extends Fn = Fn> {
  /** Set the callback function to be executed */
  setCallback: (callback: T | null) => void;
  /** Execute the pending callback if one exists and is not already executing */
  executeCallback: () => Promise<void>;
}

/**
 * A hook for managing a pending callback that can be executed later.
 * Useful for scenarios where you need to store a callback to be executed
 * after some condition is met (e.g., after authentication).
 *
 * @returns A tuple containing the current state and handlers for the pending callback
 * @example
 * ```tsx
 * const [state, handlers] = usePendingCallback();
 *
 * // Set a callback to be executed later
 * handlers.setCallback(() => () => console.log('Hello'));
 *
 * // Execute the callback when ready
 * await handlers.executeCallback();
 * ```
 */
function usePendingCallback<T extends Fn = Fn>(): [
  PendingCallbackState<T>,
  PendingCallbackHandlers<T>,
] {
  const [state, setState] = useState<PendingCallbackState<T>>({
    callback: null,
    isExecuting: false,
  });

  const setCallback = (callback: T | null) => {
    setState((prev) => ({ ...prev, callback }));
  };

  const executeCallback = async () => {
    if (!state.callback || state.isExecuting) {
      return;
    }

    try {
      setState((prev) => ({ ...prev, isExecuting: true }));
      await state.callback();
    } catch (error) {
      // Let the error propagate up
      throw error;
    } finally {
      setState({ callback: null, isExecuting: false });
    }
  };

  return [state, { setCallback, executeCallback }];
}

export default usePendingCallback;

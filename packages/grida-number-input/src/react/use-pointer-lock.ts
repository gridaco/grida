import { useCallback, useRef, useEffect } from "react";

type UsePointerLockProps = {
  /** Whether pointer lock is enabled */
  enabled?: boolean;
  /** Callback when pointer lock is acquired */
  onLock?: () => void;
  /** Callback when pointer lock is released */
  onUnlock?: () => void;
  /** Callback when pointer lock fails */
  onError?: (error: Error) => void;
};

/**
 * Custom hook for managing pointer lock functionality.
 *
 * This hook provides a clean interface for requesting and managing pointer lock
 * on DOM elements, with proper event handling and cleanup.
 *
 * ## Features
 * - **Automatic Event Handling**: Manages pointer lock change and error events
 * - **Element Reference**: Tracks the locked element
 * - **State Management**: Tracks lock status with refs
 * - **Callbacks**: Provides hooks for lock/unlock/error events
 * - **Cleanup**: Automatically removes event listeners
 *
 * ## Usage Examples
 * ```tsx
 * const { requestLock, exitLock, isLocked, elementRef } = usePointerLock({
 *   enabled: true,
 *   onLock: () => console.log('Pointer locked'),
 *   onUnlock: () => console.log('Pointer unlocked'),
 *   onError: (error) => console.error('Lock failed:', error)
 * });
 *
 * // Request lock on an element
 * const handleMouseDown = (event) => {
 *   if (event.target instanceof HTMLElement) {
 *     elementRef.current = event.target;
 *     requestLock();
 *   }
 * };
 *
 * // Exit lock
 * const handleMouseUp = () => {
 *   exitLock();
 * };
 * ```
 *
 * @param props - Configuration options for pointer lock
 * @returns Object containing pointer lock utilities and state
 */
export function usePointerLock({
  enabled = true,
  onLock,
  onUnlock,
  onError,
}: UsePointerLockProps = {}) {
  const ref = useRef<HTMLElement | null>(null);
  const isLockedRef = useRef<boolean>(false);

  /**
   * Requests pointer lock on the current element.
   */
  const requestLock = useCallback(async () => {
    if (!enabled || !ref.current || isLockedRef.current) {
      return;
    }

    try {
      await ref.current.requestPointerLock();
      isLockedRef.current = true;
      onLock?.();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.warn("Failed to request pointer lock:", err);
      onError?.(err);
    }
  }, [enabled, onLock, onError]);

  /**
   * Exits pointer lock.
   */
  const exitLock = useCallback(() => {
    if (!isLockedRef.current) {
      return;
    }

    try {
      document.exitPointerLock();
      isLockedRef.current = false;
      onUnlock?.();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.warn("Failed to exit pointer lock:", err);
      onError?.(err);
    }
  }, [onUnlock, onError]);

  /**
   * Set up pointer lock event listeners.
   */
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handlePointerLockChange = () => {
      const wasLocked = isLockedRef.current;
      isLockedRef.current = document.pointerLockElement === ref.current;

      // Trigger callbacks based on state change
      if (!wasLocked && isLockedRef.current) {
        onLock?.();
      } else if (wasLocked && !isLockedRef.current) {
        onUnlock?.();
      }
    };

    const handlePointerLockError = () => {
      isLockedRef.current = false;
      const error = new Error("Pointer lock failed");
      onError?.(error);
    };

    document.addEventListener("pointerlockchange", handlePointerLockChange);
    document.addEventListener("pointerlockerror", handlePointerLockError);

    return () => {
      document.removeEventListener(
        "pointerlockchange",
        handlePointerLockChange
      );
      document.removeEventListener("pointerlockerror", handlePointerLockError);
    };
  }, [enabled, onLock, onUnlock, onError]);

  return {
    /**
     * Reference to the element that will be locked
     */
    ref,

    /**
     * Whether pointer lock is currently active
     */
    isLocked: isLockedRef.current,

    /**
     * Request pointer lock on the current element
     */
    requestLock,

    /**
     * Exit pointer lock
     */
    exitLock,
  };
}

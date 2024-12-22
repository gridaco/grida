import { useEffect, useRef } from "react";

export function usePersistentHotkeys({
  onKeyDown,
  onKeyUp,
  onKeysChange,
}: {
  onKeyDown?: (key: string, pressedKeys: Set<string>) => void;
  onKeyUp?: (key: string, pressedKeys: Set<string>) => void;
  onKeysChange?: (pressedKeys: Set<string>) => void;
}) {
  const pressedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!pressedKeysRef.current.has(e.key)) {
        pressedKeysRef.current.add(e.key);
        onKeyDown?.(e.key, new Set(pressedKeysRef.current));
        onKeysChange?.(new Set(pressedKeysRef.current));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (pressedKeysRef.current.has(e.key)) {
        pressedKeysRef.current.delete(e.key);
        onKeyUp?.(e.key, new Set(pressedKeysRef.current));
        onKeysChange?.(new Set(pressedKeysRef.current));
      }
    };

    const handleBlur = () => {
      if (pressedKeysRef.current.size > 0) {
        pressedKeysRef.current.clear();
        onKeysChange?.(new Set());
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    window.addEventListener("blur", handleBlur, { capture: true });
    window.addEventListener("focus", handleBlur, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
      window.removeEventListener("blur", handleBlur, { capture: true });
    };
  }, [onKeyDown, onKeyUp, onKeysChange]);

  return {
    isKeyPressed: (key: string) => pressedKeysRef.current.has(key),
    getPressedKeys: () => new Set(pressedKeysRef.current),
  };
}

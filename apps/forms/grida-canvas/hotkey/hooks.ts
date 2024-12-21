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

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [onKeyDown, onKeyUp, onKeysChange]);

  return {
    isKeyPressed: (key: string) => pressedKeysRef.current.has(key),
    getPressedKeys: () => new Set(pressedKeysRef.current),
  };
}

import { useClickedOutside } from "@/hooks/use-clicked-outside";
import {
  KeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
} from "react";

interface BlockKeysProps {
  children: ReactNode;
  onEscape?: () => void;
  onEnter?: () => void;
  outside?: "enter" | "escape";
  className?: string;
}

/**
 * Blocks key events from propagating
 * We use this with cell editor to allow editor component to handle keys.
 * Example: press enter to add newline on textEditor
 */
export const BlockKeys = ({
  children,
  onEscape,
  onEnter,
  outside,
  className,
}: BlockKeysProps) => {
  const ref = useRef(null);
  const isClickedOutside = useClickedOutside(ref);

  const handleKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
    switch (ev.key) {
      case "Escape":
        ev.stopPropagation();
        if (onEscape) onEscape();
        break;
      case "Enter":
        ev.stopPropagation();
        if (!ev.shiftKey && onEnter) {
          ev.preventDefault();
          onEnter();
        }
        break;
    }
  };

  useEffect(() => {
    if (!isClickedOutside) return;
    switch (outside) {
      case "enter":
        onEnter?.();
        return;
      case "escape":
        onEscape?.();
        return;
    }
  }, [isClickedOutside, outside]);

  return (
    <div ref={ref} onKeyDown={handleKeyDown} className={className}>
      {children}
    </div>
  );
};

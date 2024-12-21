import { cn } from "@/utils";
import { useState } from "react";
import { usePersistentHotkeys } from "../hotkey/hooks";

const keysymbols: Record<string, string> = {
  Control: "⌃",
  Shift: "⇧",
  Alt: "⌥",
  Meta: "⌘",
  Enter: "↵",
  Backspace: "⌫",
  Escape: "⎋",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  // Add more key mappings as needed
};

export default function KeyboardInputOverlay({
  className,
}: {
  className?: string;
}) {
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());

  usePersistentHotkeys({
    onKeysChange: setPressedKeys,
  });

  const displayedKeys = Array.from(pressedKeys)
    .filter(Boolean)
    .map((key) => keysymbols[key] || key.toUpperCase())
    .join(" + ");

  return (
    displayedKeys && (
      <div
        className={cn(
          "bg-foreground/50 border text-background px-4 py-2 rounded-lg shadow-md",
          className
        )}
      >
        {displayedKeys}
      </div>
    )
  );
}

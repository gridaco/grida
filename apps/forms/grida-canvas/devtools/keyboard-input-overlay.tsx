import { cn } from "@/utils";
import { useEffect, useState } from "react";

const keySymbolMap: Record<string, string> = {
  Control: "Ctrl",
  Shift: "Shift",
  Alt: "Alt",
  Meta: "⌘",
  Enter: "↵",
  Backspace: "⌫",
  Escape: "⎋",
  // Add more key mappings as needed
};

const modifierKeys = ["Meta", "Control", "Shift", "Alt"];

export default function KeyboardInputOverlay({
  className,
}: {
  className?: string;
}) {
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    const pressed = new Set<string>();

    const handleKeyDown = (e: KeyboardEvent) => {
      pressed.add(e.key);
      setPressedKeys(new Set(pressed));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (modifierKeys.includes(e.key)) {
        pressed.clear();
        setPressedKeys(new Set(pressed));
        return;
      }
      pressed.delete(e.key);
      setPressedKeys(new Set(pressed));
    };

    const handleBlur = () => {
      pressed.clear();
      setPressedKeys(new Set());
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  const displayedKeys = Array.from(pressedKeys)
    .filter(Boolean)
    .map((key) => keySymbolMap[key] || key.toUpperCase())
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

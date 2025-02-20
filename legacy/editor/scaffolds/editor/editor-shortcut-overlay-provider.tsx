import React, { useState, useEffect } from "react";

export function EditorShortcutOverlayProvider({
  children,
  disabled,
}: React.PropsWithChildren<{
  disabled?: boolean;
}>) {
  return (
    <>
      {!disabled && (
        <div className="fixed bottom-10 left-10 h-10 bg-black/20 z-50 rounded-md">
          {/* overlay */}
          <MetaKeyDisplay />
        </div>
      )}
      {children}
    </>
  );
}

const MetaKeyDisplay: React.FC = () => {
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [isCmdPressed, setIsCmdPressed] = useState(false);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);

  const handleKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case "Shift":
        setIsShiftPressed(true);
        break;
      case "Alt":
        setIsAltPressed(true);
        break;
      case "Meta":
        setIsCmdPressed(true);
        break;
      case "Control":
        setIsCtrlPressed(true);
        break;
    }
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    switch (event.key) {
      case "Shift":
        setIsShiftPressed(false);
        break;
      case "Alt":
        setIsAltPressed(false);
        break;
      case "Meta":
        setIsCmdPressed(false);
        break;
      case "Control":
        setIsCtrlPressed(false);
        break;
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const display_txt = Object.entries({
    shift: isShiftPressed,
    alt: isAltPressed,
    cmd: isCmdPressed,
    crtl: isCtrlPressed,
  })
    .filter(([, pressed]) => pressed)
    .map(([key]) => key_map[key])
    .join(" + ");

  return (
    <div className="p-4">
      <span className="text-white text-2xl font-bold">{display_txt}</span>
    </div>
  );
};

const key_map = {
  cmd: "⌘",
  shift: "⇪",
  alt: "⌥",
  crtl: "⌃",
};

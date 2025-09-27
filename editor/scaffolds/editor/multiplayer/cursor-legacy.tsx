import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { PointerCursorSVG } from "@/components/multiplayer/cursor";

export function PointerCursor({
  local,
  color,
  typing,
  x,
  y,
  message,
  onMessageChange,
  onMessageBlur,
}: {
  local: boolean;
  typing?: boolean;
  color: {
    hue: string;
    fill: string;
  };

  x: number;
  y: number;
  message?: string;
  onMessageChange?: (message: string) => void;
  onMessageBlur?: () => void;
}) {
  const { fill, hue } = color;

  return (
    <>
      {!local && (
        <PointerCursorSVG
          style={{
            willChange: "transform",
            color: fill,
            transform: `translateX(${x}px) translateY(${y}px)`,
            zIndex: 999,
          }}
          className="absolute top-0 left-0 transform pointer-events-none"
          fill={fill}
          hue={hue}
        />
      )}
      {(message || typing) && (
        <PointerCursorMessageBubble
          key={typing ? "typing" : "message"}
          local={local}
          color={fill}
          hue={hue}
          x={x + 16}
          y={y + 16}
          message={message}
          onMessageChange={onMessageChange}
          onMessageBlur={onMessageBlur}
        />
      )}
    </>
  );
}

function useBubbleVisibility(message: string, delay: number) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (message) {
      setIsVisible(true);

      const handler = setTimeout(() => {
        setIsVisible(false);
      }, delay);

      return () => clearTimeout(handler);
    }
  }, [message, delay]);

  return isVisible;
}

function PointerCursorMessageBubble({
  local,
  x,
  y,
  color,
  hue,
  message,
  onMessageChange,
  onMessageBlur,
}: {
  local: boolean;
  color: string;
  hue: string;
  x: number;
  y: number;
  message?: string;
  onMessageChange?: (message: string) => void;
  onMessageBlur?: () => void;
}) {
  const isVisible = useBubbleVisibility(message ?? "", 3000);

  return (
    <motion.div
      data-local={local}
      initial={{ opacity: 1 }}
      animate={{ opacity: isVisible ? 1 : 0 }}
      transition={{ opacity: { duration: isVisible ? 0 : 1.5 } }}
      onAnimationComplete={() => {
        if (!isVisible) {
          onMessageBlur?.();
          onMessageChange?.("");
        }
      }}
      className="absolute top-0 left-0 transform pointer-events-none data-[local='true']:duration-0"
      style={{
        transform: `translateX(${x}px) translateY(${y}px)`,
        zIndex: 999 - 1,
      }}
    >
      <div
        className="rounded-full h-10 min-w-48 w-full overflow-hidden border-2"
        style={{ backgroundColor: color, borderColor: hue }}
      >
        <input
          readOnly={!local}
          value={message}
          autoFocus={local}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onMessageBlur?.();
              return;
            }
            if (e.key === "Escape") {
              onMessageBlur?.();
              onMessageChange?.("");
              return;
            }
          }}
          onChange={(e) => {
            onMessageChange?.(e.target.value);
          }}
          onBlur={onMessageBlur}
          maxLength={100}
          className="px-4 w-full h-full bg-transparent outline-none border-none text-white placeholder:text-white/50"
          placeholder="Say something"
        />
      </div>
    </motion.div>
  );
}

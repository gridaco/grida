"use client";
import React, { useEffect, useState } from "react";
import { motion } from "motion/react";

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
        <svg
          width="12"
          height="16"
          viewBox="0 0 18 24"
          fill="none"
          className="absolute top-0 left-0 transform transition-transform duration-75 pointer-events-none"
          style={{
            color: fill,
            transform: `translateX(${x}px) translateY(${y}px)`,
            zIndex: 999,
          }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2.717 2.22918L15.9831 15.8743C16.5994 16.5083 16.1503 17.5714 15.2661 17.5714H9.35976C8.59988 17.5714 7.86831 17.8598 7.3128 18.3783L2.68232 22.7C2.0431 23.2966 1 22.8434 1 21.969V2.92626C1 2.02855 2.09122 1.58553 2.717 2.22918Z"
            fill={fill}
            stroke={hue}
            strokeWidth="2"
          />
        </svg>
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
      className="absolute top-0 left-0 transform transition-transform duration-75 pointer-events-none data-[local='true']:duration-0"
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

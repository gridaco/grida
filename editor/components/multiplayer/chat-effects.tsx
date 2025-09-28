"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";

interface ChatEffect {
  id: string;
  text: string;
  position: { x: number; y: number };
  color: {
    fill: string;
    hue: string;
  };
}

interface ChatEffectsContextValue {
  showEffect: (
    text: string,
    position: { x: number; y: number },
    color: { fill: string; hue: string }
  ) => void;
}

const ChatEffectsContext = createContext<ChatEffectsContextValue | null>(null);

export function ChatEffectsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [effects, setEffects] = useState<ChatEffect[]>([]);

  const showEffect = useCallback(
    (
      text: string,
      position: { x: number; y: number },
      color: { fill: string; hue: string }
    ) => {
      const id =
        Date.now().toString() + Math.random().toString(36).substr(2, 9);

      // Add slight randomization to direction
      const randomX = (Math.random() - 0.5) * 20; // -10 to +10 pixels
      const randomY = (Math.random() - 0.5) * 10; // -5 to +5 pixels

      setEffects((prev) => [
        ...prev,
        {
          id,
          text,
          position: {
            x: position.x + randomX,
            y: position.y + randomY,
          },
          color,
        },
      ]);
    },
    []
  );

  const removeEffect = useCallback((id: string) => {
    setEffects((prev) => prev.filter((effect) => effect.id !== id));
  }, []);

  const contextValue: ChatEffectsContextValue = {
    showEffect,
  };

  // Render effects in a portal at document root
  const effectsPortal =
    typeof document !== "undefined"
      ? createPortal(
          <AnimatePresence>
            {effects.map((effect) => (
              <motion.span
                key={effect.id}
                initial={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                }}
                animate={{
                  opacity: [1, 1, 0],
                  y: [0, -20, -40],
                  x: [
                    0,
                    (Math.random() - 0.5) * 10,
                    (Math.random() - 0.5) * 20,
                  ], // Random horizontal drift
                  scale: [1, 1.1, 0.9],
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 1.2,
                  times: [0, 0.3, 1], // Keyframe timing: scale up at 30%, then fade out
                  ease: [0.25, 0.46, 0.45, 0.94],
                  delay: 0.05,
                }}
                className="fixed whitespace-nowrap text-white pointer-events-none"
                style={{
                  left: effect.position.x,
                  top: effect.position.y - 32, // Position above the commit point
                  backgroundColor: effect.color.fill, // Use same background as chat bubble
                  padding: "2px 8px",
                  borderRadius: "12px",
                  fontSize: "14px", // Match typical input font size
                  fontWeight: "400", // Match typical input font weight
                  fontFamily: "inherit", // Match input font family
                  lineHeight: "1.5", // Match typical input line height
                  boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                  zIndex: 1000,
                }}
                onAnimationComplete={() => {
                  removeEffect(effect.id);
                }}
              >
                {effect.text}
              </motion.span>
            ))}
          </AnimatePresence>,
          document.body
        )
      : null;

  return (
    <ChatEffectsContext.Provider value={contextValue}>
      {children}
      {effectsPortal}
    </ChatEffectsContext.Provider>
  );
}

export function useChatEffects() {
  const context = useContext(ChatEffectsContext);
  if (!context) {
    throw new Error("useChatEffects must be used within a ChatEffectsProvider");
  }
  return context;
}

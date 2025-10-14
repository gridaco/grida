"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/components/lib/utils";
import ContentEditable, {
  type ContentEditableEvent,
} from "@/components/primitives/contenteditable";
import { FakeLocalPointerCursorPNG } from "../cursor/cursor-fake";

const floatingChatVariants = cva(
  "min-w-12 border-2 shadow-lg w-full px-3 py-2 ",
  {
    variants: {
      variant: {
        rounded: "rounded-full",
        "top-left-sharp":
          " pl-3 pr-4 rounded-tr-full rounded-br-full rounded-bl-full",
      },
    },
    defaultVariants: {
      variant: "top-left-sharp",
    },
  }
);

export interface CursorChatInputProps {
  /** Colors for the chat bubble */
  color: {
    fill: string;
    hue: string;
  };
  /** Placeholder text for the input */
  placeholder?: string;
  /** Maximum length of the message */
  maxLength?: number;
  /** Callback when the input value changes (on every keystroke) */
  onValueChange?: (value: string) => void;
  /** Callback when the value is committed (Enter key or blur) */
  onValueCommit?: (value: string) => void;
  /** Callback when the input loses focus */
  onBlur?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Visual variant of the chat bubble */
  variant?: "rounded" | "top-left-sharp";
}

// CursorChat component interfaces
export interface CursorChatProps {
  /** Whether the chat is open (controlled externally) */
  open: boolean;
  /** Callback when the input value changes (on every keystroke) */
  onValueChange?: (value: string) => void;
  /** Callback when the value is committed (Enter key or blur) */
  onValueCommit?: (value: string) => void;
  /** Callback when the chat should close (triggered by blur) */
  onClose?: () => void;
  /** Colors for the chat bubble */
  color?: {
    fill: string;
    hue: string;
  };
}

/**
 * Cursor chat component with window-level pointer tracking and bounds detection.
 */
export function CursorChat({
  open,
  onValueChange,
  onValueCommit,
  onClose,
  color = {
    fill: "#3b82f6",
    hue: "#1d4ed8",
  },
}: CursorChatProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const boundsRef = useRef<HTMLDivElement>(null);

  // Window-level pointer tracking for position
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener("pointermove", handlePointerMove);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  return (
    <div ref={boundsRef} className="fixed inset-0 z-50 pointer-events-none">
      {open && (
        <div
          className="fixed top-0 left-0 transition-none"
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
            zIndex: 1000,
          }}
        >
          <FakeLocalPointerCursorPNG className="absolute" />
          <CursorChatInput
            color={color}
            placeholder="Type your message..."
            onValueChange={onValueChange}
            onValueCommit={onValueCommit}
            onBlur={onClose}
            className="left-3 top-3"
          />
        </div>
      )}
    </div>
  );
}

/**
 * A headless cursor chat component for design-only usage.
 * Positioning and effects are managed by the caller.
 *
 * Features:
 * - Auto-close timer that resets on user input (debounced)
 * - Keyboard shortcuts (Enter to send, Esc to close)
 * - Customizable variants (rounded, top-left-sharp)
 * - Configurable colors, placeholder, and auto-close delay
 *
 * @example
 * ```tsx
 * <CursorChatInput
 *   variant="rounded"
 *   placeholder="Type your message..."
 *   onValueChange={(value) => console.log('typing:', value)}
 *   onValueCommit={(value) => console.log('sent:', value)}
 *   onBlur={() => console.log('input lost focus')}
 * />
 * ```
 */
export function CursorChatInput({
  color,
  placeholder = "Say something",
  maxLength = 64,
  onValueChange,
  onValueCommit,
  onBlur,
  className,
  variant,
}: CursorChatInputProps) {
  const [message, setMessage] = useState("");
  const contentEditableRef = useRef<HTMLSpanElement>(null);

  // Helper function to get text content from ContentEditable
  const getTextContent = () => {
    return contentEditableRef.current?.textContent || "";
  };

  // Check if we should show placeholder
  const shouldShowPlaceholder = !message || message.trim() === "";

  // Focus ContentEditable when component mounts
  useEffect(() => {
    if (contentEditableRef.current) {
      // Clear any existing content in the DOM
      contentEditableRef.current.innerHTML = "";
      contentEditableRef.current.focus();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevent default line break in ContentEditable

      const textContent = getTextContent();
      if (textContent.trim()) {
        const messageText = textContent.trim();
        onValueCommit?.(messageText);

        setMessage(""); // Reset input after commit
      }
      return;
    }
    if (e.key === "Escape") {
      // Explicitly blur the input
      contentEditableRef.current?.blur();
      return;
    }
  };

  const handleBeforeInput = (e: any) => {
    if (!maxLength) return;

    const currentLength = getTextContent().length;
    const inputData = e.dataTransfer?.getData("text/plain") || e.data || "";

    if (currentLength + inputData.length > maxLength) {
      e.preventDefault();
    }
  };

  const handleChange = (e: ContentEditableEvent) => {
    const value = e.target.textContent;
    setMessage(value);
    onValueChange?.(value);
  };

  const handleBlur = () => {
    onBlur?.();
  };

  return (
    <div
      className={cn(
        floatingChatVariants({ variant }),
        // grid with a 0-height row then the real content row; columns size to max-content
        "text-sm inline-grid relative [grid-template-rows:0_auto] [grid-template-columns:max-content]",
        className
      )}
      style={{ backgroundColor: color.fill, borderColor: color.hue }}
    >
      {/* WIDTH SIZER in 0-height row */}
      {shouldShowPlaceholder && (
        <span
          className="
            col-start-1 row-start-1
            overflow-hidden          /* enforce the 0 row height */
            inline-block whitespace-nowrap opacity-0 px-4 py-2
          "
        >
          {placeholder}
        </span>
      )}

      {/* Real content in the auto row */}
      <div className="col-start-1 row-start-2 relative">
        <ContentEditable
          html={message}
          tagName="span"
          innerRef={contentEditableRef}
          onKeyDown={handleKeyDown}
          onBeforeInput={handleBeforeInput}
          onChange={handleChange}
          onBlur={handleBlur}
          className="bg-transparent outline-none border-none text-white inline-block w-full"
          contentEditable={true}
        />

        {shouldShowPlaceholder && (
          <div className="absolute inset-0 pointer-events-none">
            <span className="text-white/50 whitespace-nowrap">
              {placeholder}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

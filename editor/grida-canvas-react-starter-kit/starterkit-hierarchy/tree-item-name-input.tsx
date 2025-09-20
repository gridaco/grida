"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/components/lib/utils";

/**
 * A specialized input component for renaming nodes in the hierarchy tree.
 *
 * This component has complex event handling due to several requirements:
 * 1. It needs to handle Enter key submission while preventing other global handlers from intercepting it
 * 2. It needs to properly handle blur events for both clicking outside and pressing Enter
 * 3. It needs to prevent event bubbling that might trigger parent handlers
 *
 * The implementation uses multiple layers of event handling:
 * - A form wrapper to handle native form submission
 * - A capture-phase event listener to intercept events before they reach other handlers
 * - React's synthetic event handlers for standard input behavior
 *
 * This complexity is necessary because:
 * - The tree component might have its own keyboard handlers
 * - The application might have global keyboard shortcuts
 * - We need to ensure the rename operation completes properly in all scenarios
 */
export function NameInput({
  isRenaming,
  initialValue,
  onValueChange,
  onValueCommit,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "ref" | "value"> & {
  isRenaming?: boolean;
  initialValue: string;
  onValueChange?: (name: string) => void;
  onValueCommit?: (name: string) => void;
}) {
  const isInitiallyFocused = useRef(false);
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);

  // Standard input change handler
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      props.onChange?.(e);
      setValue(e.target.value);
      onValueChange?.(e.target.value);
    },
    [onValueChange, props.onChange]
  );

  // Handle blur events (clicking outside, tabbing out, etc.)
  const onBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      isInitiallyFocused.current = false;
      props.onBlur?.(e);
      onValueCommit?.(value);
    },
    [onValueCommit, value, props.onBlur]
  );

  // Handle keyboard events, particularly Enter and Escape
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        e.stopPropagation();
        onValueCommit?.(value);
        ref.current?.blur();
        return;
      }

      if (e.key === "Escape") {
        ref.current?.blur();
        return;
      }

      props.onKeyDown?.(e);
    },
    [onValueCommit, value, props.onKeyDown]
  );

  // Set up capture-phase event listener to intercept events before they reach other handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        e.stopPropagation();
        onValueCommit?.(value);
        ref.current?.blur();
      }
    };

    const input = ref.current;
    if (input) {
      // Using capture phase (true) to intercept events before they reach other handlers
      input.addEventListener("keydown", handleKeyDown, true);
    }

    return () => {
      if (input) {
        input.removeEventListener("keydown", handleKeyDown, true);
      }
    };
  }, [ref.current, initialValue, onValueCommit, value]);

  useEffect(() => {
    if (!isRenaming) return;
    const input = ref.current;
    if (input && !isInitiallyFocused.current) {
      input.focus();
      input.select();
      isInitiallyFocused.current = true;
    }
  }, [ref.current, isRenaming]);

  return (
    <div className="w-full min-w-0">
      {isRenaming ? (
        <input
          type="text"
          {...props}
          ref={ref}
          value={value}
          className={cn(
            "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex w-full min-w-0 rounded-md border bg-transparent px-3 py-1 shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            className
          )}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onClick={(e) => {
            e.stopPropagation();
            props.onClick?.(e);
          }}
        />
      ) : (
        <div className={cn("flex w-full min-w-0 items-center", className)}>
          <span className="truncate">{value}</span>
        </div>
      )}
    </div>
  );
}

"use client";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/utils";

export function SearchInput({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof Input> & { variant?: "icon" }) {
  if (variant === "icon") {
    return <ExpandableSearchInput className={className} {...props} />;
  }

  return (
    <div className="relative flex-1 md:grow-0">
      <SearchIcon className="absolute left-2.5 inset-y-0 my-auto h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        type="search"
        placeholder="Search"
        className={cn("pl-8", className)}
        {...props}
      />
    </div>
  );
}

export function useExpandableInput(ignoreIds: string[] = []) {
  const [isExpanded, setIsExpanded] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onTriggerClick = () => {
    setIsExpanded(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
  };

  const onInputBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    if (event.relatedTarget?.id && ignoreIds.includes(event.relatedTarget.id)) {
      return;
    }
    if (
      !rootRef.current?.contains(event.relatedTarget as Node) &&
      inputRef.current?.value === ""
    ) {
      setIsExpanded(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      inputRef.current?.blur();
      setIsExpanded(false);
    }
  };

  return {
    rootRef,
    inputRef,
    isExpanded,
    onTriggerClick,
    onInputBlur,
    onKeyDown,
  };
}

function ExpandableSearchInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  const {
    rootRef,
    isExpanded,
    onTriggerClick,
    onKeyDown,
    inputRef,
    onInputBlur,
  } = useExpandableInput();

  return (
    <motion.div
      ref={rootRef}
      className="relative ml-auto flex-1 md:grow-0 h-9"
      animate={{ width: isExpanded ? 200 : 36 }}
      initial={{ width: 36 }}
      transition={{ duration: 0.15 }}
      onClick={onTriggerClick}
      onKeyDown={onKeyDown}
    >
      <div
        className={cn(
          "absolute left-0",
          buttonVariants({
            variant: "ghost",
            size: "icon",
          }),
          isExpanded && "pointer-events-none"
        )}
      >
        <SearchIcon className="h-4 w-4 text-muted-foreground" />
      </div>
      <Input
        type="search"
        ref={inputRef}
        placeholder="Search"
        className={cn("pl-8", className)}
        {...props}
        onBlur={onInputBlur}
        style={{
          display: isExpanded ? "block" : "none",
        }}
      />
    </motion.div>
  );
}

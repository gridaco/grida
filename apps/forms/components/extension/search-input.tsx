"use client";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { useRef, useState } from "react";
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
    <div className="relative ml-auto flex-1 md:grow-0">
      <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search"
        className={cn("pl-8", className)}
        {...props}
      />
    </div>
  );
}

function ExpandableSearchInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  const [isExpanded, setIsExpanded] = useState(false);

  const ref = useRef<HTMLInputElement>(null);

  const handleIconClick = () => {
    setIsExpanded(true);
    setTimeout(() => {
      ref.current?.focus();
    }, 10);
  };

  const handleBlur = () => {
    if (ref.current?.value === "") {
      setIsExpanded(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      ref.current?.blur();
    }
  };

  return (
    <motion.div
      className="relative ml-auto flex-1 md:grow-0 h-9"
      animate={{ width: isExpanded ? 200 : 36 }}
      initial={{ width: 36 }}
      transition={{ duration: 0.15 }}
      onClick={handleIconClick}
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
        ref={ref}
        placeholder="Search"
        className={cn("pl-8", className)}
        onKeyDown={handleKeyDown}
        {...props}
        onBlur={handleBlur}
        style={{
          display: isExpanded ? "block" : "none",
        }}
      />
    </motion.div>
  );
}

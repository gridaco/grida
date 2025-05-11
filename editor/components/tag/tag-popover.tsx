"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { TagInputStyleClassesProps, type Tag as TagType } from "./tag-input";
import { TagList, TagListProps } from "./tag-list";
import { Button } from "../ui/button";
import { cn } from "@/components/lib/utils";

type TagPopoverProps = {
  children: React.ReactNode;
  tags: TagType[];
  customTagRenderer?: (tag: TagType, isActiveTag: boolean) => React.ReactNode;
  activeTagIndex?: number | null;
  setActiveTagIndex?: (index: number | null) => void;
  classStyleProps: {
    popoverClasses: TagInputStyleClassesProps["tagPopover"];
    tagListClasses: TagInputStyleClassesProps["tagList"];
    tagClasses: TagInputStyleClassesProps["tag"];
  };
  disabled?: boolean;
  usePortal?: boolean;
} & TagListProps;

export const TagPopover: React.FC<TagPopoverProps> = ({
  children,
  tags,
  customTagRenderer,
  activeTagIndex,
  setActiveTagIndex,
  classStyleProps,
  disabled,
  usePortal,
  ...tagProps
}) => {
  const triggerContainerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverContentRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [popoverWidth, setPopoverWidth] = useState<number>(0);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [sideOffset, setSideOffset] = useState<number>(0);

  useEffect(() => {
    const handleResize = () => {
      if (triggerContainerRef.current && triggerRef.current) {
        setPopoverWidth(triggerContainerRef.current.offsetWidth);
        setSideOffset(
          triggerContainerRef.current.offsetWidth -
            triggerRef?.current?.offsetWidth
        );
      }
    };

    handleResize(); // Call on mount and layout changes

    window.addEventListener("resize", handleResize); // Adjust on window resize
    return () => window.removeEventListener("resize", handleResize);
  }, [triggerContainerRef, triggerRef]);

  // Close the popover when clicking outside of it
  useEffect(() => {
    const handleOutsideClick = (
      event: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent
    ) => {
      if (
        isPopoverOpen &&
        triggerContainerRef.current &&
        popoverContentRef.current &&
        !triggerContainerRef.current.contains(event.target as Node) &&
        !popoverContentRef.current.contains(event.target as Node)
      ) {
        setIsPopoverOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isPopoverOpen]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open && triggerContainerRef.current) {
        setPopoverWidth(triggerContainerRef.current.offsetWidth);
      }

      if (open) {
        inputRef.current?.focus();
        setIsPopoverOpen(open);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inputFocused]
  );

  const handleInputFocus = (
    event:
      | React.FocusEvent<HTMLInputElement>
      | React.FocusEvent<HTMLTextAreaElement>
  ) => {
    // Only set inputFocused to true if the popover is already open.
    // This will prevent the popover from opening due to an input focus if it was initially closed.
    if (isPopoverOpen) {
      setInputFocused(true);
    }

    const userOnFocus = (children as React.ReactElement<any>).props.onFocus;
    if (userOnFocus) userOnFocus(event);
  };

  const handleInputBlur = (
    event:
      | React.FocusEvent<HTMLInputElement>
      | React.FocusEvent<HTMLTextAreaElement>
  ) => {
    setInputFocused(false);

    // Allow the popover to close if no other interactions keep it open
    if (!isPopoverOpen) {
      setIsPopoverOpen(false);
    }

    const userOnBlur = (children as React.ReactElement<any>).props.onBlur;
    if (userOnBlur) userOnBlur(event);
  };

  return (
    <Popover
      open={isPopoverOpen}
      onOpenChange={handleOpenChange}
      modal={usePortal}
    >
      <div
        className="relative flex items-center rounded-md border border-input bg-transparent pr-3"
        ref={triggerContainerRef}
      >
        {React.cloneElement(children as React.ReactElement<any>, {
          onFocus: handleInputFocus,
          onBlur: handleInputBlur,
          ref: inputRef,
        })}
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon"
            role="combobox"
            className={cn(
              `hover:bg-transparent`,
              classStyleProps?.popoverClasses?.popoverTrigger
            )}
            onClick={() => setIsPopoverOpen(!isPopoverOpen)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`lucide lucide-chevron-down size-4 shrink-0 opacity-50 ${isPopoverOpen ? "rotate-180" : "rotate-0"}`}
            >
              <path d="m6 9 6 6 6-6"></path>
            </svg>
          </Button>
        </PopoverTrigger>
      </div>
      <PopoverContent
        ref={popoverContentRef}
        className={cn(
          `w-full space-y-3`,
          classStyleProps?.popoverClasses?.popoverContent
        )}
        style={{
          marginLeft: `-${sideOffset}px`,
          width: `${popoverWidth}px`,
        }}
      >
        <div className="space-y-1">
          <h4 className="text-sm font-medium leading-none">Entered Tags</h4>
          <p className="text-sm text-muted-foregrounsd text-left">
            These are the tags you&apos;ve entered.
          </p>
        </div>
        <TagList
          tags={tags}
          customTagRenderer={customTagRenderer}
          activeTagIndex={activeTagIndex}
          setActiveTagIndex={setActiveTagIndex}
          classStyleProps={{
            tagListClasses: classStyleProps?.tagListClasses,
            tagClasses: classStyleProps?.tagClasses,
          }}
          {...tagProps}
          disabled={disabled}
        />
      </PopoverContent>
    </Popover>
  );
};

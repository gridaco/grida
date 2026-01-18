"use client";

import React, { useMemo } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { type VariantProps } from "class-variance-authority";
import { TagPopover } from "./tag-popover";
import { TagList } from "./tag-list";
import { tagVariants } from "./tag";
import { Autocomplete } from "./autocomplete";
import { cn } from "@/components/lib/utils";

export enum Delimiter {
  Comma = ",",
  Enter = "Enter",
}

type OmittedInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size" | "value"
>;

export type Tag = {
  id: string;
  text: string;
};

export interface TagInputStyleClassesProps {
  inlineTagsContainer?: string;
  tagPopover?: {
    popoverTrigger?: string;
    popoverContent?: string;
  };
  tagList?: {
    container?: string;
    sortableList?: string;
  };
  autoComplete?: {
    command?: string;
    popoverTrigger?: string;
    popoverContent?: string;
    commandList?: string;
    commandGroup?: string;
    commandItem?: string;
  };
  tag?: {
    body?: string;
    closeButton?: string;
  };
  input?: string;
  clearAllButton?: string;
}

export interface TagInputProps
  extends OmittedInputProps, VariantProps<typeof tagVariants> {
  placeholder?: string;
  tags: Tag[];
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  enableAutocomplete?: boolean;
  autocompleteOptions?: Tag[];
  maxTags?: number;
  minTags?: number;
  readOnly?: boolean;
  disabled?: boolean;
  onTagAdd?: (tag: string) => void;
  onTagRemove?: (tag: string) => void;
  allowDuplicates?: boolean;
  validateTag?: (tag: string) => boolean;
  delimiter?: Delimiter;
  showCount?: boolean;
  placeholderWhenFull?: string;
  sortTags?: boolean;
  delimiterList?: string[];
  truncate?: number;
  minLength?: number;
  maxLength?: number;
  usePopoverForTags?: boolean;
  value?: string | number | readonly string[] | { id: string; text: string }[];
  autocompleteFilter?: (option: string) => boolean;
  direction?: "row" | "column";
  onInputChange?: (value: string) => void;
  customTagRenderer?: (tag: Tag, isActiveTag: boolean) => React.ReactNode;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onTagClick?: (tag: Tag) => void;
  draggable?: boolean;
  inputFieldPosition?: "bottom" | "top";
  clearAll?: boolean;
  onClearAll?: () => void;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  restrictTagsToAutocompleteOptions?: boolean;
  inlineTags?: boolean;
  activeTagIndex: number | null;
  setActiveTagIndex: React.Dispatch<React.SetStateAction<number | null>>;
  styleClasses?: TagInputStyleClassesProps;
  usePortal?: boolean;
  addOnPaste?: boolean;
  addTagsOnBlur?: boolean;
  generateTagId?: () => string;
}

const TagInput = React.forwardRef<HTMLInputElement, TagInputProps>(
  (props, ref) => {
    const {
      id,
      placeholder,
      tags,
      setTags,
      variant,
      size,
      shape,
      enableAutocomplete,
      autocompleteOptions,
      maxTags,
      delimiter = Delimiter.Comma,
      onTagAdd,
      onTagRemove,
      allowDuplicates,
      showCount,
      validateTag,
      placeholderWhenFull = "Max tags reached",
      sortTags,
      delimiterList,
      truncate,
      autocompleteFilter,
      borderStyle,
      textCase,
      interaction,
      animation,
      textStyle,
      minLength,
      maxLength,
      direction = "row",
      onInputChange,
      customTagRenderer,
      onFocus,
      onBlur,
      onTagClick,
      draggable = false,
      inputFieldPosition = "bottom",
      clearAll = false,
      onClearAll,
      usePopoverForTags = false,
      inputProps = {},
      restrictTagsToAutocompleteOptions,
      inlineTags = true,
      addTagsOnBlur = false,
      activeTagIndex,
      setActiveTagIndex,
      styleClasses = {},
      disabled = false,
      usePortal = false,
      addOnPaste = false,
      generateTagId = (text: string) => text,
    } = props;

    const [inputValue, setInputValue] = React.useState("");
    const [tagCount, setTagCount] = React.useState(Math.max(0, tags.length));
    const inputRef = React.useRef<HTMLInputElement>(null);

    if (
      (maxTags !== undefined && maxTags < 0) ||
      (props.minTags !== undefined && props.minTags < 0)
    ) {
      throw new Error("maxTags and minTags cannot be less than 0");
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      if (addOnPaste && newValue.includes(delimiter)) {
        const splitValues = newValue
          .split(delimiter)
          .map((v) => v.trim())
          .filter((v) => v);
        splitValues.forEach((value) => {
          if (!value) return; // Skip empty strings from split

          const newTagText = value.trim();

          // Check if the tag is in the autocomplete options if restrictTagsToAutocomplete is true
          if (
            restrictTagsToAutocompleteOptions &&
            !autocompleteOptions?.some((option) => option.text === newTagText)
          ) {
            console.warn("Tag not allowed as per autocomplete options");
            return;
          }

          if (validateTag && !validateTag(newTagText)) {
            console.warn("Invalid tag as per validateTag");
            return;
          }

          if (minLength && newTagText.length < minLength) {
            console.warn(`Tag "${newTagText}" is too short`);
            return;
          }

          if (maxLength && newTagText.length > maxLength) {
            console.warn(`Tag "${newTagText}" is too long`);
            return;
          }

          const newTagId = generateTagId(newTagText);

          // Add tag if duplicates are allowed or tag does not already exist
          if (allowDuplicates || !tags.some((tag) => tag.text === newTagText)) {
            if (maxTags === undefined || tags.length < maxTags) {
              // Check for maxTags limit
              const newTag = { id: newTagId, text: newTagText };
              setTags((prevTags) => [...prevTags, newTag]);
              onTagAdd?.(newTagText);
            } else {
              console.warn("Reached the maximum number of tags allowed");
            }
          } else {
            console.warn(`Duplicate tag "${newTagText}" not added`);
          }
        });
        setInputValue("");
      } else {
        setInputValue(newValue);
      }
      onInputChange?.(newValue);
    };

    const handleInputFocus = (event: React.FocusEvent<HTMLInputElement>) => {
      setActiveTagIndex(null); // Reset active tag index when the input field gains focus
      onFocus?.(event);
    };

    const handleInputBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      if (addTagsOnBlur && inputValue.trim()) {
        const newTagText = inputValue.trim();

        if (validateTag && !validateTag(newTagText)) {
          return;
        }

        if (minLength && newTagText.length < minLength) {
          console.warn("Tag is too short");
          return;
        }

        if (maxLength && newTagText.length > maxLength) {
          console.warn("Tag is too long");
          return;
        }

        if (
          (allowDuplicates || !tags.some((tag) => tag.text === newTagText)) &&
          (maxTags === undefined || tags.length < maxTags)
        ) {
          const newTagId = generateTagId(newTagText);
          setTags([...tags, { id: newTagId, text: newTagText }]);
          onTagAdd?.(newTagText);
          setTagCount((prevTagCount) => prevTagCount + 1);
          setInputValue("");
        }
      }

      onBlur?.(event);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        delimiterList
          ? delimiterList.includes(e.key)
          : e.key === delimiter || e.key === Delimiter.Enter
      ) {
        e.preventDefault();
        const newTagText = inputValue.trim();

        // Check if the tag is in the autocomplete options if restrictTagsToAutocomplete is true
        if (
          restrictTagsToAutocompleteOptions &&
          !autocompleteOptions?.some((option) => option.text === newTagText)
        ) {
          // error
          return;
        }

        if (validateTag && !validateTag(newTagText)) {
          return;
        }

        if (minLength && newTagText.length < minLength) {
          console.warn("Tag is too short");
          // error
          return;
        }

        // Validate maxLength
        if (maxLength && newTagText.length > maxLength) {
          // error
          console.warn("Tag is too long");
          return;
        }

        const newTagId = generateTagId(newTagText);

        if (
          newTagText &&
          (allowDuplicates || !tags.some((tag) => tag.text === newTagText)) &&
          (maxTags === undefined || tags.length < maxTags)
        ) {
          setTags([...tags, { id: newTagId, text: newTagText }]);
          onTagAdd?.(newTagText);
          setTagCount((prevTagCount) => prevTagCount + 1);
        }
        setInputValue("");
      } else {
        switch (e.key) {
          case "Delete":
            if (activeTagIndex !== null) {
              e.preventDefault();
              const newTags = [...tags];
              newTags.splice(activeTagIndex, 1);
              setTags(newTags);
              setActiveTagIndex((prev) =>
                newTags.length === 0
                  ? null
                  : prev! >= newTags.length
                    ? newTags.length - 1
                    : prev
              );
              setTagCount((prevTagCount) => prevTagCount - 1);
              onTagRemove?.(tags[activeTagIndex].text);
            }
            break;
          case "Backspace":
            if (activeTagIndex !== null) {
              e.preventDefault();
              const newTags = [...tags];
              newTags.splice(activeTagIndex, 1);
              setTags(newTags);
              setActiveTagIndex((prev) => (prev! === 0 ? null : prev! - 1));
              setTagCount((prevTagCount) => prevTagCount - 1);
              onTagRemove?.(tags[activeTagIndex].text);
            }
            break;
          case "ArrowRight":
            e.preventDefault();
            if (activeTagIndex === null) {
              setActiveTagIndex(0);
            } else {
              setActiveTagIndex((prev) =>
                prev! + 1 >= tags.length ? 0 : prev! + 1
              );
            }
            break;
          case "ArrowLeft":
            e.preventDefault();
            if (activeTagIndex === null) {
              setActiveTagIndex(tags.length - 1);
            } else {
              setActiveTagIndex((prev) =>
                prev! === 0 ? tags.length - 1 : prev! - 1
              );
            }
            break;
          case "Home":
            e.preventDefault();
            setActiveTagIndex(0);
            break;
          case "End":
            e.preventDefault();
            setActiveTagIndex(tags.length - 1);
            break;
        }
      }
    };

    const removeTag = (idToRemove: string) => {
      setTags(tags.filter((tag) => tag.id !== idToRemove));
      onTagRemove?.(tags.find((tag) => tag.id === idToRemove)?.text || "");
      setTagCount((prevTagCount) => prevTagCount - 1);
    };

    const onSortEnd = (oldIndex: number, newIndex: number) => {
      setTags((currentTags) => {
        const newTags = [...currentTags];
        const [removedTag] = newTags.splice(oldIndex, 1);
        newTags.splice(newIndex, 0, removedTag);

        return newTags;
      });
    };

    const handleClearAll = () => {
      if (!onClearAll) {
        setActiveTagIndex(-1);
        setTags([]);
        return;
      }
      onClearAll?.();
    };

    // const filteredAutocompleteOptions = autocompleteFilter
    //   ? autocompleteOptions?.filter((option) => autocompleteFilter(option.text))
    //   : autocompleteOptions;
    const filteredAutocompleteOptions = useMemo(() => {
      return (autocompleteOptions || []).filter((option) =>
        option.text
          .toLowerCase()
          .includes(inputValue ? inputValue.toLowerCase() : "")
      );
    }, [inputValue, autocompleteOptions]);

    const displayedTags = sortTags ? [...tags].sort() : tags;

    const truncatedTags = truncate
      ? tags.map((tag) => ({
          id: tag.id,
          text:
            tag.text?.length > truncate
              ? `${tag.text.substring(0, truncate)}...`
              : tag.text,
        }))
      : displayedTags;

    return (
      <div
        className={`w-full flex ${!inlineTags && tags.length > 0 ? "gap-3" : ""} ${
          inputFieldPosition === "bottom"
            ? "flex-col"
            : inputFieldPosition === "top"
              ? "flex-col-reverse"
              : "flex-row"
        }`}
      >
        {!usePopoverForTags &&
          (!inlineTags ? (
            <TagList
              tags={truncatedTags}
              customTagRenderer={customTagRenderer}
              variant={variant}
              size={size}
              shape={shape}
              borderStyle={borderStyle}
              textCase={textCase}
              interaction={interaction}
              animation={animation}
              textStyle={textStyle}
              onTagClick={onTagClick}
              draggable={draggable}
              onSortEnd={onSortEnd}
              onRemoveTag={removeTag}
              direction={direction}
              inlineTags={inlineTags}
              activeTagIndex={activeTagIndex}
              setActiveTagIndex={setActiveTagIndex}
              classStyleProps={{
                tagListClasses: styleClasses?.tagList,
                tagClasses: styleClasses?.tag,
              }}
              disabled={disabled}
            />
          ) : (
            !enableAutocomplete && (
              <div className="w-full">
                <div
                  className={cn(
                    `flex flex-row flex-wrap items-center gap-2 p-2 w-full rounded-md border border-input bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`,
                    styleClasses?.inlineTagsContainer
                  )}
                >
                  <TagList
                    tags={truncatedTags}
                    customTagRenderer={customTagRenderer}
                    variant={variant}
                    size={size}
                    shape={shape}
                    borderStyle={borderStyle}
                    textCase={textCase}
                    interaction={interaction}
                    animation={animation}
                    textStyle={textStyle}
                    onTagClick={onTagClick}
                    draggable={draggable}
                    onSortEnd={onSortEnd}
                    onRemoveTag={removeTag}
                    direction={direction}
                    inlineTags={inlineTags}
                    activeTagIndex={activeTagIndex}
                    setActiveTagIndex={setActiveTagIndex}
                    classStyleProps={{
                      tagListClasses: styleClasses?.tagList,
                      tagClasses: styleClasses?.tag,
                    }}
                    disabled={disabled}
                  />
                  <Input
                    ref={inputRef}
                    id={id}
                    type="text"
                    placeholder={
                      maxTags !== undefined && tags.length >= maxTags
                        ? placeholderWhenFull
                        : placeholder
                    }
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    {...inputProps}
                    className={cn(
                      "border-0 h-5 bg-transparent focus-visible:ring-0 focus-visible:ring-transparent focus-visible:ring-offset-0 flex-1 w-fit shadow-none",
                      // className,
                      styleClasses?.input
                    )}
                    autoComplete={enableAutocomplete ? "on" : "off"}
                    list={
                      enableAutocomplete ? "autocomplete-options" : undefined
                    }
                    disabled={
                      disabled ||
                      (maxTags !== undefined && tags.length >= maxTags)
                    }
                  />
                </div>
              </div>
            )
          ))}
        {enableAutocomplete ? (
          <div className="w-full">
            <Autocomplete
              tags={tags}
              setTags={setTags}
              setInputValue={setInputValue}
              autocompleteOptions={filteredAutocompleteOptions as Tag[]}
              setTagCount={setTagCount}
              maxTags={maxTags}
              onTagAdd={onTagAdd}
              onTagRemove={onTagRemove}
              allowDuplicates={allowDuplicates ?? false}
              inlineTags={inlineTags}
              usePortal={usePortal}
              classStyleProps={{
                command: styleClasses?.autoComplete?.command,
                popoverTrigger: styleClasses?.autoComplete?.popoverTrigger,
                popoverContent: styleClasses?.autoComplete?.popoverContent,
                commandList: styleClasses?.autoComplete?.commandList,
                commandGroup: styleClasses?.autoComplete?.commandGroup,
                commandItem: styleClasses?.autoComplete?.commandItem,
              }}
            >
              {!usePopoverForTags ? (
                !inlineTags ? (
                  // <CommandInput
                  //   placeholder={maxTags !== undefined && tags.length >= maxTags ? placeholderWhenFull : placeholder}
                  //   ref={inputRef}
                  //   value={inputValue}
                  //   disabled={disabled || (maxTags !== undefined && tags.length >= maxTags)}
                  //   onChangeCapture={handleInputChange}
                  //   onKeyDown={handleKeyDown}
                  //   onFocus={handleInputFocus}
                  //   onBlur={handleInputBlur}
                  //   className={cn(
                  //     'w-full',
                  //     // className,
                  //     styleClasses?.input,
                  //   )}
                  // />
                  <Input
                    ref={inputRef}
                    id={id}
                    type="text"
                    placeholder={
                      maxTags !== undefined && tags.length >= maxTags
                        ? placeholderWhenFull
                        : placeholder
                    }
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    {...inputProps}
                    className={cn(
                      "border-0 h-5 bg-transparent focus-visible:ring-0 focus-visible:ring-transparent focus-visible:ring-offset-0 flex-1 w-fit shadow-none",
                      // className,
                      styleClasses?.input
                    )}
                    autoComplete={enableAutocomplete ? "on" : "off"}
                    list={
                      enableAutocomplete ? "autocomplete-options" : undefined
                    }
                    disabled={
                      disabled ||
                      (maxTags !== undefined && tags.length >= maxTags)
                    }
                  />
                ) : (
                  <div
                    className={cn(
                      `flex flex-row flex-wrap items-center p-2 gap-2 h-fit w-full bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`,
                      styleClasses?.inlineTagsContainer
                    )}
                  >
                    <TagList
                      tags={truncatedTags}
                      customTagRenderer={customTagRenderer}
                      variant={variant}
                      size={size}
                      shape={shape}
                      borderStyle={borderStyle}
                      textCase={textCase}
                      interaction={interaction}
                      animation={animation}
                      textStyle={textStyle}
                      onTagClick={onTagClick}
                      draggable={draggable}
                      onSortEnd={onSortEnd}
                      onRemoveTag={removeTag}
                      direction={direction}
                      inlineTags={inlineTags}
                      activeTagIndex={activeTagIndex}
                      setActiveTagIndex={setActiveTagIndex}
                      classStyleProps={{
                        tagListClasses: styleClasses?.tagList,
                        tagClasses: styleClasses?.tag,
                      }}
                      disabled={disabled}
                    />
                    {/* <CommandInput
                    placeholder={maxTags !== undefined && tags.length >= maxTags ? placeholderWhenFull : placeholder}
                    ref={inputRef}
                    value={inputValue}
                    disabled={disabled || (maxTags !== undefined && tags.length >= maxTags)}
                    onChangeCapture={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    inlineTags={inlineTags}
                    className={cn(
                      'border-0 flex-1 w-fit h-5',
                      // className,
                      styleClasses?.input,
                    )}
                  /> */}
                    <Input
                      ref={inputRef}
                      id={id}
                      type="text"
                      placeholder={
                        maxTags !== undefined && tags.length >= maxTags
                          ? placeholderWhenFull
                          : placeholder
                      }
                      value={inputValue}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      onFocus={handleInputFocus}
                      onBlur={handleInputBlur}
                      {...inputProps}
                      className={cn(
                        "border-0 h-5 bg-transparent focus-visible:ring-0 focus-visible:ring-transparent focus-visible:ring-offset-0 flex-1 w-fit shadow-none",
                        // className,
                        styleClasses?.input
                      )}
                      autoComplete={enableAutocomplete ? "on" : "off"}
                      list={
                        enableAutocomplete ? "autocomplete-options" : undefined
                      }
                      disabled={
                        disabled ||
                        (maxTags !== undefined && tags.length >= maxTags)
                      }
                    />
                  </div>
                )
              ) : (
                <TagPopover
                  tags={truncatedTags}
                  customTagRenderer={customTagRenderer}
                  variant={variant}
                  size={size}
                  shape={shape}
                  borderStyle={borderStyle}
                  textCase={textCase}
                  interaction={interaction}
                  animation={animation}
                  textStyle={textStyle}
                  onTagClick={onTagClick}
                  draggable={draggable}
                  onSortEnd={onSortEnd}
                  onRemoveTag={removeTag}
                  direction={direction}
                  activeTagIndex={activeTagIndex}
                  setActiveTagIndex={setActiveTagIndex}
                  classStyleProps={{
                    popoverClasses: styleClasses?.tagPopover,
                    tagListClasses: styleClasses?.tagList,
                    tagClasses: styleClasses?.tag,
                  }}
                  disabled={disabled}
                >
                  {/* <CommandInput
                  placeholder={maxTags !== undefined && tags.length >= maxTags ? placeholderWhenFull : placeholder}
                  ref={inputRef}
                  value={inputValue}
                  disabled={disabled || (maxTags !== undefined && tags.length >= maxTags)}
                  onChangeCapture={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  className={cn(
                    'w-full',
                    // className,
                    styleClasses?.input,
                  )}
                /> */}
                  <Input
                    ref={inputRef}
                    id={id}
                    type="text"
                    placeholder={
                      maxTags !== undefined && tags.length >= maxTags
                        ? placeholderWhenFull
                        : placeholder
                    }
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    {...inputProps}
                    className={cn(
                      "border-0 h-5 bg-transparent focus-visible:ring-0 focus-visible:ring-transparent focus-visible:ring-offset-0 flex-1 w-fit shadow-none",
                      // className,
                      styleClasses?.input
                    )}
                    autoComplete={enableAutocomplete ? "on" : "off"}
                    list={
                      enableAutocomplete ? "autocomplete-options" : undefined
                    }
                    disabled={
                      disabled ||
                      (maxTags !== undefined && tags.length >= maxTags)
                    }
                  />
                </TagPopover>
              )}
            </Autocomplete>
          </div>
        ) : (
          <div className="w-full">
            {!usePopoverForTags ? (
              !inlineTags ? (
                <Input
                  ref={inputRef}
                  id={id}
                  type="text"
                  placeholder={
                    maxTags !== undefined && tags.length >= maxTags
                      ? placeholderWhenFull
                      : placeholder
                  }
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  {...inputProps}
                  className={cn(
                    styleClasses?.input
                    // className
                  )}
                  autoComplete={enableAutocomplete ? "on" : "off"}
                  list={enableAutocomplete ? "autocomplete-options" : undefined}
                  disabled={
                    disabled ||
                    (maxTags !== undefined && tags.length >= maxTags)
                  }
                />
              ) : null
            ) : (
              <TagPopover
                tags={truncatedTags}
                customTagRenderer={customTagRenderer}
                variant={variant}
                size={size}
                shape={shape}
                borderStyle={borderStyle}
                textCase={textCase}
                interaction={interaction}
                animation={animation}
                textStyle={textStyle}
                onTagClick={onTagClick}
                draggable={draggable}
                onSortEnd={onSortEnd}
                onRemoveTag={removeTag}
                direction={direction}
                activeTagIndex={activeTagIndex}
                setActiveTagIndex={setActiveTagIndex}
                classStyleProps={{
                  popoverClasses: styleClasses?.tagPopover,
                  tagListClasses: styleClasses?.tagList,
                  tagClasses: styleClasses?.tag,
                }}
                disabled={disabled}
              >
                <Input
                  ref={inputRef}
                  id={id}
                  type="text"
                  placeholder={
                    maxTags !== undefined && tags.length >= maxTags
                      ? placeholderWhenFull
                      : placeholder
                  }
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  {...inputProps}
                  autoComplete={enableAutocomplete ? "on" : "off"}
                  list={enableAutocomplete ? "autocomplete-options" : undefined}
                  disabled={
                    disabled ||
                    (maxTags !== undefined && tags.length >= maxTags)
                  }
                  className={cn(
                    "border-0 w-full",
                    styleClasses?.input
                    // className
                  )}
                />
              </TagPopover>
            )}
          </div>
        )}

        {showCount && maxTags && (
          <div className="flex">
            <span className="text-muted-foreground text-sm mt-1 ml-auto">
              {`${tagCount}`}/{`${maxTags}`}
            </span>
          </div>
        )}
        {clearAll && (
          <Button
            type="button"
            onClick={handleClearAll}
            className={cn("mt-2", styleClasses?.clearAllButton)}
          >
            Clear All
          </Button>
        )}
      </div>
    );
  }
);

TagInput.displayName = "TagInput";

export { TagInput };

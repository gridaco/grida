/**
 * Modernized AutosizeInput component
 *
 * Source: https://github.com/JedWatson/react-input-autosize/blob/master/src/AutosizeInput.js
 * Repo: https://github.com/JedWatson/react-input-autosize
 * License: MIT
 *
 * Auto-resizing input field for React that dynamically adjusts its width based on content.
 * Modernized from the original class-based implementation to use React hooks and TypeScript.
 */

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  forwardRef,
} from "react";

const sizerStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  visibility: "hidden",
  height: 0,
  overflow: "scroll",
  whiteSpace: "pre",
};

const INPUT_PROPS_BLACKLIST = [
  "extraWidth",
  "inputClassName",
  "inputRef",
  "minWidth",
  "onAutosize",
  "placeholderIsMinWidth",
] as const;

const cleanInputProps = (inputProps: Record<string, any>) => {
  INPUT_PROPS_BLACKLIST.forEach((field) => delete inputProps[field]);
  return inputProps;
};

const copyStyles = (styles: CSSStyleDeclaration, node: HTMLElement) => {
  node.style.fontSize = styles.fontSize;
  node.style.fontFamily = styles.fontFamily;
  node.style.fontWeight = styles.fontWeight;
  node.style.fontStyle = styles.fontStyle;
  node.style.letterSpacing = styles.letterSpacing;
  node.style.textTransform = styles.textTransform;
};

export interface AutosizeInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  /** className for the outer element */
  className?: string;
  /** additional width for input element */
  extraWidth?: number | string;
  /** id to use for the input, can be set for consistent snapshots */
  id?: string;
  /** className for the input element */
  inputClassName?: string;
  /** ref callback for the input element */
  inputRef?: (el: HTMLInputElement | null) => void;
  /** css styles for the input element */
  inputStyle?: React.CSSProperties;
  /** minimum width for input element */
  minWidth?: number | string;
  /** onAutosize handler: function(newWidth) {} */
  onAutosize?: (newWidth: number) => void;
  /** onChange handler: function(event) {} */
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** placeholder text */
  placeholder?: string;
  /** don't collapse size to less than the placeholder */
  placeholderIsMinWidth?: boolean;
  /** css styles for the outer element */
  style?: React.CSSProperties;
  /** field value */
  value?: string | number;
  /** default field value */
  defaultValue?: string | number;
}

const AutosizeInput = forwardRef<HTMLInputElement, AutosizeInputProps>(
  (
    {
      className,
      extraWidth,
      id,
      inputClassName,
      inputRef,
      inputStyle,
      minWidth = 1,
      onAutosize,
      onChange,
      placeholder,
      placeholderIsMinWidth,
      style,
      value,
      defaultValue,
      ...props
    },
    ref
  ) => {
    const inputRefInternal = useRef<HTMLInputElement>(null);
    const sizerRef = useRef<HTMLDivElement>(null);
    const placeholderSizerRef = useRef<HTMLDivElement>(null);
    const [inputWidth, setInputWidth] = useState<number>(Number(minWidth));

    const updateInputWidth = useCallback(() => {
      if (
        !sizerRef.current ||
        typeof sizerRef.current.scrollWidth === "undefined"
      ) {
        return;
      }

      let newInputWidth: number;

      if (placeholder && (!value || (value && placeholderIsMinWidth))) {
        const sizerWidth = sizerRef.current.scrollWidth;
        const placeholderWidth = placeholderSizerRef.current?.scrollWidth || 0;
        newInputWidth = Math.max(sizerWidth, placeholderWidth) + 2;
      } else {
        newInputWidth = sizerRef.current.scrollWidth + 2;
      }

      // add extraWidth to the detected width
      const extraWidthValue =
        typeof extraWidth === "number"
          ? extraWidth
          : parseInt(String(extraWidth)) || 0;
      newInputWidth += extraWidthValue;

      if (newInputWidth < Number(minWidth)) {
        newInputWidth = Number(minWidth);
      }

      if (newInputWidth !== inputWidth) {
        setInputWidth(newInputWidth);
        onAutosize?.(newInputWidth);
      }
    }, [
      extraWidth,
      minWidth,
      onAutosize,
      inputWidth,
      placeholder,
      placeholderIsMinWidth,
      value,
    ]);

    const copyInputStyles = useCallback(() => {
      if (!inputRefInternal.current || !window.getComputedStyle) {
        return;
      }

      const inputStyles = window.getComputedStyle(inputRefInternal.current);
      if (sizerRef.current) {
        copyStyles(inputStyles, sizerRef.current);
      }
      if (placeholderSizerRef.current) {
        copyStyles(inputStyles, placeholderSizerRef.current);
      }
    }, []);

    useEffect(() => {
      copyInputStyles();
      updateInputWidth();
    }, [copyInputStyles, updateInputWidth]);

    useEffect(() => {
      updateInputWidth();
    }, [updateInputWidth, value]);

    const handleRef = useCallback(
      (el: HTMLInputElement | null) => {
        inputRefInternal.current = el;
        if (typeof inputRef === "function") {
          inputRef(el);
        }
        if (ref) {
          if (typeof ref === "function") {
            ref(el);
          } else {
            ref.current = el;
          }
        }
      },
      [inputRef, ref]
    );

    const sizerValue = [defaultValue, value, ""].reduce(
      (previousValue, currentValue) => {
        if (previousValue !== null && previousValue !== undefined) {
          return previousValue;
        }
        return currentValue;
      }
    );

    const wrapperStyle: React.CSSProperties = {
      ...style,
      display: style?.display || "inline-block",
    };

    const finalInputStyle: React.CSSProperties = {
      boxSizing: "content-box",
      width: `${inputWidth}px`,
      ...inputStyle,
    };

    const cleanedProps = cleanInputProps({ ...props });
    cleanedProps.className = inputClassName;
    cleanedProps.id = id;
    cleanedProps.style = finalInputStyle;
    cleanedProps.onChange = onChange;

    return (
      <div className={className} style={wrapperStyle}>
        <input {...cleanedProps} ref={handleRef} />
        <div ref={sizerRef} style={sizerStyle}>
          {sizerValue}
        </div>
        {placeholder && (
          <div ref={placeholderSizerRef} style={sizerStyle}>
            {placeholder}
          </div>
        )}
      </div>
    );
  }
);

AutosizeInput.displayName = "AutosizeInput";

export default AutosizeInput;

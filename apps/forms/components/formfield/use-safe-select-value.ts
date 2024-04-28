import { useState, useEffect, useMemo } from "react";

interface Option {
  value: string;
  label: string;
  disabled?: boolean | null;
}

/**
 * A hook that manages select input values safely, resetting the value if it becomes disabled.
 * @param _value - The controlled value of the select input.
 * @param _defaultValue - The default value for uncontrolled usage.
 * @param options - The list of options for the select input.
 * @param onChange - Optional callback to notify parent components of value changes.
 * @returns - The current value, defaultValue, and a setter for the value.
 */
function useSafeSelectValue<T extends string | undefined = string | undefined>({
  value: _value,
  defaultValue: _defaultValue,
  options: _options,
  onChange,
  useUndefined = false,
  locked = false,
}: {
  value: T;
  defaultValue: T;
  options?: Option[];
  onChange?: (value: T) => void;
  useUndefined?: boolean;
  locked?: boolean;
}): {
  value: string | undefined;
  defaultValue: string | undefined;
  options: Option[] | undefined;
  setValue: (value: T) => void;
} {
  const isControlled = _value !== undefined;
  const [value, setValue] = useState(_value);

  console.log("value", value, locked);

  const stableOptions = useMemo(() => {
    return locked
      ? _options?.map((option) => ({ ...option, disabled: false }))
      : _options;
  }, [_options, locked]);

  useEffect(() => {
    if (locked) {
      return;
    }

    const currentValue = isControlled ? _value! : value; // Use non-null assertion for controlledValue since we check isControlled
    const currentOption = _options?.find(
      (option) => option.value === currentValue
    );

    if (currentOption && currentOption.disabled) {
      // if the disabled option is not a default value, reset the value to the default.
      // otherwise, reset the value to an empty string or undefined.
      const newValue =
        currentValue !== _defaultValue
          ? useUndefined
            ? undefined
            : ""
          : _defaultValue;

      if (!isControlled) {
        setValue(newValue as T); // Only update internal state if uncontrolled
      }
      onChange?.(newValue as T); // Notify about the reset if there's a handler
    }
  }, [
    _value,
    _defaultValue,
    _options,
    isControlled,
    value,
    onChange,
    useUndefined,
    locked,
  ]);

  const setSafeValue = (newValue: T) => {
    if (!isControlled) {
      setValue(newValue);
    }
    onChange?.(newValue);
  };

  return {
    value: isControlled ? _value! : value,
    defaultValue: _defaultValue, // Always return the initial defaultValue for reference
    options: stableOptions,
    setValue: setSafeValue,
  };
}

export default useSafeSelectValue;

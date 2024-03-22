import { FormFieldType } from "@/types";
import React, { useEffect } from "react";

export function FormFieldPreview({
  name,
  label,
  labelCapitalize,
  type,
  placeholder,
  required,
  options,
  helpText,
  readonly,
  disabled,
  pattern,
}: {
  name: string;
  label?: string;
  type: FormFieldType;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  options?: { label?: string | null; value: string }[];
  pattern?: string;
  readonly?: boolean;
  disabled?: boolean;
  labelCapitalize?: boolean;
}) {
  const sharedInputProps:
    | React.ComponentProps<"input">
    | React.ComponentProps<"textarea"> = {
    name: name,
    readOnly: readonly,
    disabled: disabled,
    autoFocus: false,
    placeholder: placeholder,
    required: required,
    pattern,
  };

  function renderInput() {
    switch (type) {
      case "textarea": {
        return (
          <HtmlTextarea
            {...(sharedInputProps as React.ComponentProps<"textarea">)}
          />
        );
      }
      case "checkbox": {
        return (
          <input
            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            type="checkbox"
            {...(sharedInputProps as React.ComponentProps<"input">)}
          />
        );
      }
      case "select": {
        return (
          <select {...(sharedInputProps as React.ComponentProps<"select">)}>
            {options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      }
      case "color": {
        return (
          <input
            type="color"
            {...(sharedInputProps as React.ComponentProps<"input">)}
          />
        );
      }
      case "radio": {
        return (
          <fieldset>
            {options?.map((option) => (
              <div className="flex items-center gap-2" key={option.value}>
                <input
                  type="radio"
                  name={name}
                  id={option.value}
                  value={option.value}
                  {...(sharedInputProps as React.ComponentProps<"input">)}
                />
                <label
                  htmlFor={option.value}
                  className="ms-2 text-sm font-medium text-gray-900 dark:text-gray-300"
                >
                  {option.label}
                </label>
              </div>
            ))}
          </fieldset>
        );
      }
      default: {
        return (
          <HtmlInput
            type={type}
            {...(sharedInputProps as React.ComponentProps<"input">)}
          />
        );
      }
    }
  }

  return (
    <label data-field-type={type} className="flex flex-col">
      <span
        data-capitalize={labelCapitalize}
        className="data-[capitalize]:capitalize"
      >
        {label || name}
      </span>
      {renderInput()}
      {helpText && <span className="text-sm text-gray-600">{helpText}</span>}
    </label>
  );
}

function HtmlTextarea({ ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
      {...props}
    />
  );
}

function HtmlInput({ ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
      {...props}
    />
  );
}

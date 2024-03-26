import { FormFieldDataSchema, FormFieldType, PaymentFieldData } from "@/types";
import React, { useEffect } from "react";
import { Select } from "../select";
import { SignatureCanvas } from "../signature-canvas";
import { StripePaymentFormFieldPreview } from "./form-field-preview-payment-stripe";
import { TossPaymentsPaymentFormFieldPreview } from "./form-field-preview-payment-tosspayments";

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
  autoComplete,
  accept,
  multiple,
  pattern,
  data,
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
  autoComplete?: string;
  accept?: string;
  multiple?: boolean;
  labelCapitalize?: boolean;
  data?: FormFieldDataSchema | null;
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
    autoComplete,
    accept,
    multiple,
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
      case "file": {
        return (
          <HtmlFileInput
            {...(sharedInputProps as React.ComponentProps<"input">)}
          />
        );
      }
      case "checkbox": {
        return (
          <input
            className="w-4 h-4 text-blue-600 bg-neutral-100 border-neutral-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-neutral-800 focus:ring-2 dark:bg-neutral-700 dark:border-neutral-600"
            type="checkbox"
            {...(sharedInputProps as React.ComponentProps<"input">)}
          />
        );
      }
      case "select": {
        return (
          <Select {...(sharedInputProps as React.ComponentProps<"select">)}>
            {options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
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
                  className="ms-2 text-sm font-medium text-neutral-900 dark:text-neutral-300"
                >
                  {option.label}
                </label>
              </div>
            ))}
          </fieldset>
        );
      }
      case "signature": {
        return (
          // TODO: this is not accepted by form.
          <SignatureCanvas
            {...(sharedInputProps as React.ComponentProps<"input">)}
          />
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

  if (type === "hidden") {
    return <input type="hidden" name={name} />;
  }

  if (type === "payment") {
    return <PaymentField data={data as PaymentFieldData} disabled={disabled} />;
  }

  return (
    <label data-field-type={type} className="flex flex-col gap-1">
      <span
        data-capitalize={labelCapitalize}
        className="data-[capitalize]:capitalize"
      >
        {label || name}
      </span>
      {renderInput()}
      {helpText && <span className="text-sm text-neutral-600">{helpText}</span>}
    </label>
  );
}

function HtmlTextarea({ ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className="block p-2.5 w-full text-sm text-neutral-900 bg-neutral-50 rounded-lg border border-neutral-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-neutral-700 dark:border-neutral-600 dark:placeholder-neutral-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
      {...props}
    />
  );
}

function HtmlInput({ ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className="bg-neutral-50 border border-neutral-300 text-neutral-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-neutral-700 dark:border-neutral-600 dark:placeholder-neutral-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
      {...props}
    />
  );
}

function HtmlFileInput({ ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type="file"
      className="
        text-sm text-stone-500
        file:mr-5 file:py-1 file:px-3
        file:rounded file:border-none
        file:text-xs file:font-medium
        file:bg-stone-50 file:text-stone-700
        hover:file:cursor-pointer hover:file:bg-blue-50
        hover:file:text-blue-700
      "
      {...props}
    />
  );
}

function PaymentField({
  data,
  disabled,
}: {
  data?: PaymentFieldData;
  disabled?: boolean;
}) {
  switch (data?.service_provider) {
    case "stripe":
      return <StripePaymentFormFieldPreview />;
    case "tosspayments":
      return <TossPaymentsPaymentFormFieldPreview disabled={disabled} />;
    default:
      return <StripePaymentFormFieldPreview />;
  }
}

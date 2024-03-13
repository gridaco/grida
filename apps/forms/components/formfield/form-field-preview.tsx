import { FormFieldType } from "@/types";
import { useEffect } from "react";

export function FormFieldPreview({
  name,
  label,
  labelCapitalize,
  type,
  placeholder,
  required,
  helpText,
}: {
  name: string;
  label: string;
  labelCapitalize?: boolean;
  type: FormFieldType;
  placeholder?: string;
  helpText?: string;
  required: boolean;
}) {
  return (
    <label className="flex flex-col">
      <span
        data-capitalize={labelCapitalize}
        className="data-[capitalize]:capitalize"
      >
        {label || name}
      </span>
      <input
        disabled={!name}
        autoFocus={false}
        className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
        type={type}
        placeholder={placeholder}
        required={required}
      />
      {helpText && <span className="text-sm text-gray-600">{helpText}</span>}
    </label>
  );
}

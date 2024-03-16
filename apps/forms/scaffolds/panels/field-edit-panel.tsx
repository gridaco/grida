"use client";

import React, { useEffect, useState } from "react";
import {
  PanelClose,
  PanelContent,
  PanelFooter,
  PanelHeader,
  PanelPropertyField,
  PanelPropertyFields,
  PanelPropertySection,
  PanelPropertySectionTitle,
  PropertyTextInput,
  SidePanel,
} from "@/components/panels/side-panel";
import { FormFieldPreview } from "@/components/formfield";
import { FormFieldType, NewFormFieldInit } from "@/types";
import { capitalCase, snakeCase } from "change-case";
import { LightningBoltIcon, LockClosedIcon } from "@radix-ui/react-icons";
import toast from "react-hot-toast";

const supported_field_types: FormFieldType[] = [
  "text",
  "textarea",
  "tel",
  "url",
  "checkbox",
  "number",
  "date",
  "month",
  "week",
  "email",
  "select",
  "password",
  "color",
  "radio",
];

// @ts-ignore
const default_field_init: {
  [key in FormFieldType]: Partial<NewFormFieldInit>;
} = {
  text: {},
  textarea: { type: "textarea" },
  tel: {
    type: "tel",
    placeholder: "123-456-7890",
    pattern: "[0-9]{3}-[0-9]{3}-[0-9]{4}",
  },
  url: {
    type: "url",
    placeholder: "https://example.com",
    pattern: "https://.*",
  },
  checkbox: { type: "checkbox" },
  number: { type: "number" },
  date: { type: "date" },
  month: { type: "month" },
  week: { type: "week" },
  email: {
    type: "email",
    name: "email",
    label: "Email",
    placeholder: "alice@example.com",
    pattern: "[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$",
  },
  select: {
    type: "select",
    options: [
      { label: "Option 1", value: "option1" },
      { label: "Option 2", value: "option2" },
      { label: "Option 3", value: "option3" },
    ],
  },
  password: { type: "password", placeholder: "Password" },
  color: { type: "color" },
  radio: {
    type: "radio",
    options: [
      { label: "Option 1", value: "option1" },
      { label: "Option 2", value: "option2" },
      { label: "Option 3", value: "option3" },
    ],
  },
};

const input_can_have_options: FormFieldType[] = ["select", "radio"];
const input_can_have_pattern: FormFieldType[] = supported_field_types.filter(
  (type) => !["checkbox", "color", "radio"].includes(type)
);

export function FieldEditPanel({
  title,
  onSubmit,
  formResetKey = 0,
  ...props
}: React.ComponentProps<typeof SidePanel> & {
  title?: string;
  formResetKey?: number;
  onSubmit?: (field: NewFormFieldInit) => void;
}) {
  const [effect_cause, set_effect_cause] = useState<"ai" | "human">("human");
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [placeholder, setPlaceholder] = useState("");
  const [helpText, setHelpText] = useState("");
  const [type, setType] = useState<FormFieldType>("text");
  const [required, setRequired] = useState(false);
  const [pattern, setPattern] = useState<string | undefined>();
  const [options, setOptions] = useState<{ label: string; value: string }[]>(
    []
  );

  const preview_label = buildPreviewLabel({
    name,
    label,
    required,
  });

  const has_options = input_can_have_options.includes(type);
  const has_pattern = input_can_have_pattern.includes(type);

  const preview_placeholder =
    placeholder || convertToPlainText(label) || convertToPlainText(name);

  const preview_disabled = !name;

  const onSaveClick = () => {
    onSubmit?.({
      name,
      label,
      placeholder,
      helpText,
      type,
      required,
    });
  };

  const onSuggestion = (schema: NewFormFieldInit) => {
    set_effect_cause("ai");

    setName(schema.name);
    setLabel(schema.label);
    setPlaceholder(schema.placeholder);
    setHelpText(schema.helpText);
    setType(schema.type);
    setRequired(schema.required);
    setOptions(schema.options || []);
    setPattern(schema.pattern);
  };

  useEffect(() => {
    if (effect_cause === "human") {
      if (type in default_field_init) {
        const defaults = default_field_init[type];
        setName(defaults.name || "");
        setLabel(defaults.label || "");
        setPlaceholder(defaults.placeholder || "");
        setHelpText(defaults.helpText || "");
        setRequired(defaults.required || false);
        // reset options if there were no existing options
        if (!options?.length) {
          setOptions(defaults.options || []);
        }
        setPattern(defaults.pattern);
      }
    }
  }, [type, effect_cause, options?.length]);

  return (
    <SidePanel {...props}>
      <PanelHeader>{title}</PanelHeader>
      <PanelContent>
        <PanelPropertySection>
          <PanelPropertySectionTitle>Preview</PanelPropertySectionTitle>
          <PanelPropertyFields>
            <div className="relative w-full min-h-40 bg-neutral-200 rounded p-10 border border-black/20">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  toast.success("Test: Input is valid", {
                    position: "top-right",
                  });
                }}
              >
                <FormFieldPreview
                  name={name}
                  type={type}
                  label={preview_label}
                  labelCapitalize={!!label}
                  placeholder={preview_placeholder}
                  helpText={helpText}
                  required={required}
                  disabled={preview_disabled}
                  options={has_options ? options : undefined}
                  pattern={pattern}
                />
                <div className="absolute bottom-0 right-0 m-2">
                  <button
                    type="submit"
                    className="rounded-full px-2 py-1 bg-neutral-100 text-xs font-mono"
                  >
                    Test
                  </button>
                </div>
              </form>
            </div>
          </PanelPropertyFields>
        </PanelPropertySection>
        <PanelPropertySection grid={false}>
          <FormFieldAssistant onSuggestion={onSuggestion} />
        </PanelPropertySection>
        <form key={formResetKey}>
          <PanelPropertySection>
            <PanelPropertySectionTitle>Field</PanelPropertySectionTitle>
            <PanelPropertyFields>
              <PanelPropertyField label={"Type"}>
                <select
                  value={type}
                  onChange={(e) => {
                    set_effect_cause("human");
                    setType(e.target.value as FormFieldType);
                  }}
                >
                  {supported_field_types.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </PanelPropertyField>
              <PanelPropertyField
                label={
                  <div className="flex gap-2 items-center">
                    <LockClosedIcon />
                    Name *
                  </div>
                }
                description="The input's name, identifier. Recommended to use lowercase and use an underscore to separate words e.g. column_name"
              >
                <PropertyTextInput
                  required
                  autoFocus
                  placeholder={"field_name"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </PanelPropertyField>
            </PanelPropertyFields>
          </PanelPropertySection>
          <PanelPropertySection>
            <PanelPropertySectionTitle>General</PanelPropertySectionTitle>
            <PanelPropertyFields>
              <PanelPropertyField
                label={"Label"}
                description="The label that will be displayed to the user"
              >
                <PropertyTextInput
                  placeholder={"Label Text"}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </PanelPropertyField>
              <PanelPropertyField
                label={"Placeholder"}
                description="The placeholder text that will be displayed in the input when it's empty."
              >
                <PropertyTextInput
                  placeholder={"Placeholder Text"}
                  value={placeholder}
                  onChange={(e) => setPlaceholder(e.target.value)}
                />
              </PanelPropertyField>
              <PanelPropertyField
                label={"Help Text"}
                description="A small hint that will be displayed next to the input to help the user understand what to input."
              >
                <PropertyTextInput
                  placeholder={"Help Text"}
                  value={helpText}
                  onChange={(e) => setHelpText(e.target.value)}
                />
              </PanelPropertyField>
              {type !== "checkbox" && (
                <PanelPropertyField label={"Required"}>
                  <input
                    type="checkbox"
                    checked={required}
                    onChange={(e) => setRequired(e.target.checked)}
                  />
                </PanelPropertyField>
              )}
            </PanelPropertyFields>
          </PanelPropertySection>
          {has_options && (
            <PanelPropertySection>
              <PanelPropertySectionTitle>Options</PanelPropertySectionTitle>
              <PanelPropertyFields>
                {/*  */}
                {options?.map((option, index) => (
                  <p key={index}>
                    {option.label} - {option.value}
                  </p>
                ))}
              </PanelPropertyFields>
            </PanelPropertySection>
          )}
          <PanelPropertySection>
            <PanelPropertySectionTitle>Validation</PanelPropertySectionTitle>
            <PanelPropertyFields>
              {has_pattern && (
                <PanelPropertyField
                  label={"Pattern"}
                  description="A regular expression that the input's value must match"
                >
                  <PropertyTextInput
                    placeholder={".*"}
                    value={pattern}
                    onChange={(e) => setPattern(e.target.value)}
                  />
                </PanelPropertyField>
              )}
              {type === "checkbox" && (
                <PanelPropertyField label={"Required"}>
                  <input
                    type="checkbox"
                    checked={required}
                    onChange={(e) => setRequired(e.target.checked)}
                  />
                  <p>
                    The checkbox will be required if it is checked. The user
                    must check the checkbox to continue.
                  </p>
                </PanelPropertyField>
              )}
            </PanelPropertyFields>
          </PanelPropertySection>
        </form>
      </PanelContent>
      <PanelFooter>
        <PanelClose>
          <button className="rounded p-2 bg-neutral-100">Cancel</button>
        </PanelClose>
        <button onClick={onSaveClick} className="rounded p-2 bg-neutral-100">
          Save
        </button>
      </PanelFooter>
    </SidePanel>
  );
}

function FormFieldAssistant({
  onSuggestion,
}: {
  onSuggestion?: (schema: NewFormFieldInit) => void;
}) {
  const [description, setDescription] = useState("");
  const [schema, setSchema] = useState<NewFormFieldInit | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const assist = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/ai/schema", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ description }),
      });

      if (response.ok) {
        const data = await response.json();
        setSchema(data);
        console.log(data);
      } else {
        const error = await response.json();
        console.error(error);
      }
    } catch (error) {
      console.error("AI assistance error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (schema) {
      onSuggestion?.(schema);
    }
  }, [schema]);

  return (
    <div className="w-full border rounded-lg p-4 shadow-sm bg-white">
      <div className="flex items-center mb-4">
        <LightningBoltIcon className="w-4 h-4 mr-2" />
        <span className="font-semibold text-gray-800">Ask AI</span>
      </div>
      <textarea
        className="w-full p-2 border-gray-300 focus:border-blue-500 focus:ring-blue-500 rounded-lg shadow-sm"
        value={description}
        placeholder="Describe the field..."
        onChange={(e) => setDescription(e.target.value)}
        rows={4}
      />
      <button
        className={`mt-3 w-full inline-flex justify-center items-center gap-2 rounded-md p-2 text-white ${isLoading ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
        onClick={assist}
        disabled={isLoading}
      >
        {isLoading ? (
          <svg
            className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        ) : (
          <LightningBoltIcon className="w-5 h-5" />
        )}
        Generate
      </button>
    </div>
  );
}

function buildPreviewLabel({
  name,
  label,
  required,
}: {
  name: string;
  label?: string;
  required?: boolean;
}) {
  let txt = label || convertToPlainText(name);
  if (required) {
    txt += " *";
  }
  return txt;
}

function convertToPlainText(input: string) {
  // Converts to snake_case then replaces underscores with spaces and capitalizes words
  return capitalCase(snakeCase(input)).toLowerCase();
}

"use client";

import React, { useEffect, useId, useState } from "react";
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
import {
  FormFieldAutocompleteType,
  FormFieldDataSchema,
  FormFieldType,
  NewFormFieldInit,
  PaymentFieldData,
} from "@/types";
import {
  CrossCircledIcon,
  DragHandleDots2Icon,
  GearIcon,
  LockClosedIcon,
  PlusIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { FormFieldAssistant } from "../ai/form-field-schema-assistant";
import toast from "react-hot-toast";
import { Select } from "@/components/select";
import {
  html5_multiple_supported_field_types,
  supported_field_autocomplete_types,
  supported_field_types,
} from "@/k/supported_field_types";
import {
  payments_service_providers,
  payments_service_providers_default,
  payments_service_providers_display_map,
} from "@/k/payments_service_providers";
import { cls_save_button } from "@/components/preferences";
import { Toggle } from "@/components/toggle";
import { fmt_snake_case_to_human_text } from "@/utils/fmt";
import clsx from "clsx";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

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
      { label: "Option A", value: "option_a" },
      { label: "Option B", value: "option_b" },
      { label: "Option C", value: "option_c" },
    ],
  },
  password: { type: "password", placeholder: "Password" },
  color: { type: "color" },
  radio: {
    type: "radio",
    options: [
      { label: "Option A", value: "option_a" },
      { label: "Option B", value: "option_b" },
      { label: "Option C", value: "option_c" },
    ],
  },
  hidden: { type: "hidden" },
  payment: {
    type: "payment",
    data: {
      type: "payment",
      service_provider: payments_service_providers_default,
    } as PaymentFieldData,
  },
};

const input_can_have_options: FormFieldType[] = ["select", "radio"];
const input_can_have_pattern: FormFieldType[] = supported_field_types.filter(
  (type) => !["checkbox", "color", "radio"].includes(type)
);

type Option = { id?: string; label?: string; value: string };

export function FieldEditPanel({
  title,
  onSave,
  formResetKey = 0,
  init,
  enableAI,
  mode = "edit",
  ...props
}: React.ComponentProps<typeof SidePanel> & {
  title?: string;
  formResetKey?: number;
  init?: Partial<NewFormFieldInit>;
  mode?: "edit" | "new";
  enableAI?: boolean;
  onSave?: (field: NewFormFieldInit) => void;
}) {
  const [effect_cause, set_effect_cause] = useState<"ai" | "human" | "system">(
    "system"
  );
  const [name, setName] = useState(init?.name || "");
  const [label, setLabel] = useState(init?.label || "");
  const [placeholder, setPlaceholder] = useState(init?.placeholder || "");
  const [helpText, setHelpText] = useState(init?.helpText || "");
  const [type, setType] = useState<FormFieldType>(init?.type || "text");
  const [required, setRequired] = useState(init?.required || false);
  const [pattern, setPattern] = useState<string | undefined>(init?.pattern);
  const [options, setOptions] = useState<Option[]>(init?.options || []);
  const [autocomplete, setAutocomplete] = useState<FormFieldAutocompleteType[]>(
    init?.autocomplete || []
  );
  const [data, setData] = useState<FormFieldDataSchema | null | undefined>(
    init?.data
  );
  const [accept, setAccept] = useState<string | undefined>(
    init?.accept ?? undefined
  );
  const [multiple, setMultiple] = useState(init?.multiple || false);

  const preview_label = buildPreviewLabel({
    name,
    label,
    required,
  });

  const has_options = input_can_have_options.includes(type);
  const has_pattern = input_can_have_pattern.includes(type);
  const has_accept = type === "file";

  const preview_placeholder =
    placeholder ||
    fmt_snake_case_to_human_text(label) ||
    fmt_snake_case_to_human_text(name);

  const preview_disabled =
    type == "payment" &&
    // disable preview if servive provider is tosspayments (it takes control over the window)
    (data as PaymentFieldData)?.service_provider === "tosspayments";

  const onSaveClick = () => {
    onSave?.({
      name,
      label,
      placeholder,
      helpText,
      type,
      required,
      pattern,
      options,
      autocomplete,
      data,
      accept,
      multiple,
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

        // optional reset
        setName((_name) => _name || defaults.name || "");
        setLabel((_label) => _label || defaults.label || "");
        setPlaceholder(
          (_placeholder) => _placeholder || defaults.placeholder || ""
        );
        setHelpText((_help) => _help || defaults.helpText || "");
        setRequired((_required) => _required || defaults.required || false);
        setData((_data) => _data || defaults.data);
        // reset options if there were no existing options
        if (!options?.length) {
          setOptions(defaults.options || []);
        }

        // always reset pattern
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
            <div className="relative w-full min-h-40 bg-neutral-200 dark:bg-neutral-800 rounded p-10 border border-black/20">
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
                  autoComplete={autocomplete.join(" ")}
                  data={data}
                  accept={accept}
                  multiple={multiple}
                />
                <div className="absolute bottom-0 right-0 m-2">
                  <button
                    type="submit"
                    className="rounded-full px-2 py-1 bg-neutral-100 dark:bg-neutral-900 text-xs font-mono"
                  >
                    Test
                  </button>
                </div>
              </form>
            </div>
          </PanelPropertyFields>
        </PanelPropertySection>
        {enableAI && (
          <PanelPropertySection grid={false}>
            <FormFieldAssistant onSuggestion={onSuggestion} />
          </PanelPropertySection>
        )}
        <form key={formResetKey}>
          <PanelPropertySection>
            <PanelPropertySectionTitle>Field</PanelPropertySectionTitle>
            <PanelPropertyFields>
              <PanelPropertyField label={"Type"}>
                <Select
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
                </Select>
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
                  autoFocus={mode === "edit"}
                  placeholder={"field_name"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </PanelPropertyField>
            </PanelPropertyFields>
          </PanelPropertySection>
          <PanelPropertySection hidden={type !== "payment"}>
            <PanelPropertySectionTitle>Payment</PanelPropertySectionTitle>
            <PanelPropertyFields>
              <PanelPropertyField label={"Service Provider"}>
                <Select
                  value={(data as PaymentFieldData)?.service_provider}
                  onChange={(e) => {
                    setData({
                      ...data,
                      type: "payment",
                      service_provider: e.target.value,
                    });
                  }}
                >
                  {payments_service_providers.map((provider) => (
                    <option
                      key={provider}
                      value={provider ?? payments_service_providers_default}
                    >
                      {payments_service_providers_display_map[provider].label}
                    </option>
                  ))}
                </Select>
              </PanelPropertyField>
            </PanelPropertyFields>
          </PanelPropertySection>
          <PanelPropertySection hidden={type == "payment"}>
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
                description={
                  <>
                    {type === "select" ? (
                      <>
                        The placeholder text that will be displayed in the input
                        when no option is selected.
                      </>
                    ) : (
                      <>
                        The placeholder text that will be displayed in the input
                        when it's empty.
                      </>
                    )}
                  </>
                }
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
              <PanelPropertyField label={"Auto Complete"}>
                <Select
                  value={autocomplete}
                  onChange={(e) => {
                    setAutocomplete([
                      e.target.value as FormFieldAutocompleteType,
                    ]);
                  }}
                >
                  {supported_field_autocomplete_types.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </PanelPropertyField>
              {html5_multiple_supported_field_types.includes(type) && (
                <PanelPropertyField label={"Multiple"}>
                  <Toggle value={multiple} onChange={setMultiple} />
                </PanelPropertyField>
              )}
              {type !== "checkbox" && (
                <PanelPropertyField label={"Required"}>
                  <Toggle value={required} onChange={setRequired} />
                </PanelPropertyField>
              )}
            </PanelPropertyFields>
          </PanelPropertySection>
          <PanelPropertySection hidden={!has_options}>
            <PanelPropertySectionTitle>Options</PanelPropertySectionTitle>
            <PanelPropertyFields>
              <OptionsEdit
                options={options}
                onAdd={() => {
                  setOptions([...options, { label: "", value: "" }]);
                }}
                onChange={(index, option) => {
                  setOptions(options.map((o, i) => (i === index ? option : o)));
                }}
                onRemove={(index) => {
                  setOptions(options.filter((_, i) => i !== index));
                }}
              />
            </PanelPropertyFields>
          </PanelPropertySection>
          <PanelPropertySection
            hidden={
              type == "payment" ||
              (!has_accept && !has_pattern && type !== "checkbox")
            }
          >
            <PanelPropertySectionTitle>Validation</PanelPropertySectionTitle>
            <PanelPropertyFields>
              {has_accept && (
                <PanelPropertyField
                  label={"Accept"}
                  description="A comma-separated list of file types that the input should accept"
                >
                  <PropertyTextInput
                    placeholder={"image/*"}
                    value={accept}
                    onChange={(e) => setAccept(e.target.value)}
                  />
                </PanelPropertyField>
              )}
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
                <PanelPropertyField
                  label={"Required"}
                  description={
                    <>
                      The checkbox will be required if it is checked. The user
                      must check the checkbox to continue.
                    </>
                  }
                >
                  <Toggle value={required} onChange={setRequired} />
                </PanelPropertyField>
              )}
            </PanelPropertyFields>
          </PanelPropertySection>
        </form>
      </PanelContent>
      <PanelFooter>
        <PanelClose>
          <button className="rounded p-2 bg-neutral-100 dark:bg-neutral-900">
            Cancel
          </button>
        </PanelClose>
        <button onClick={onSaveClick} className={cls_save_button}>
          Save
        </button>
      </PanelFooter>
    </SidePanel>
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
  let txt = label || fmt_snake_case_to_human_text(name);
  if (required) {
    txt += " *";
  }
  return txt;
}

function OptionsEdit({
  options,
  onAdd,
  onChange,
  onRemove,
}: {
  options?: Option[];
  onAdd?: () => void;
  onChange?: (index: number, option: Option) => void;
  onRemove?: (index: number) => void;
}) {
  const id = useId();

  const sensors = useSensors(useSensor(PointerSensor));

  const [mode, setMode] = useState<"simple" | "advanced">("simple");

  const toggleMode = () => {
    setMode(mode === "simple" ? "advanced" : "simple");
  };

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCorners}
      modifiers={[restrictToVerticalAxis]}
    >
      <SortableContext
        items={options?.map((option) => option.value) || []}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-4">
          <div className="flex gap-2 justify-between">
            <span className="text-xs opacity-50">
              Set the options for the select or radio input. you can set the
              value and label individually in advanced mode.
            </span>
            <button type="button" onClick={toggleMode}>
              {mode === "advanced" ? <CrossCircledIcon /> : <GearIcon />}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {mode === "advanced" && (
              <div className="flex">
                <span className="w-full text-xs">Value</span>
                <span className="w-full text-xs">Label</span>
              </div>
            )}
            {options?.map((option, index) => (
              <OptionEditItem
                key={index}
                mode={mode}
                label={option.label || ""}
                value={option.value}
                onRemove={() => {
                  onRemove?.(index);
                }}
                onChange={(option) => {
                  onChange?.(index, option);
                }}
              />
            ))}
            <button
              type="button"
              className="flex gap-2 items-center justify-center border rounded text-xs p-2 w-fit"
              onClick={onAdd}
            >
              <PlusIcon />
              Add Option
            </button>
          </div>
        </div>
      </SortableContext>
    </DndContext>
  );
}

const does_fmt_match = (a: string, b: string) =>
  fmt_snake_case_to_human_text(a).toLowerCase() === b.toLowerCase();

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function OptionEditItem({
  label: _label,
  value: _value,
  mode,
  onChange,
  onRemove,
}: {
  label: string;
  value: string;
  mode: "simple" | "advanced";
  onChange?: (option: { label: string; value: string }) => void;
  onRemove?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging,
    isSorting,
    isOver,
    transition,
  } = useSortable({ id: _value });

  const [value, setValue] = useState(_value);
  const [label, setLabel] = useState(_label);
  const [fmt_matches, set_fmt_matches] = useState<boolean>(
    does_fmt_match(value, label)
  );

  useEffect(() => {
    if (fmt_matches) {
      setLabel(capitalize(fmt_snake_case_to_human_text(value)));
    }
    set_fmt_matches(does_fmt_match(value, label));
  }, [value]);

  useEffect(() => {
    set_fmt_matches(does_fmt_match(value, label));
  }, [label]);

  useEffect(() => {
    onChange?.({ label, value });
  }, [value, label]);

  const style = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 1 : 0,
    transition,
  };

  return (
    <div
      //
      ref={setNodeRef}
      style={style}
      className="flex gap-1"
    >
      <button
        //
        type="button"
        {...listeners}
        {...attributes}
        ref={setActivatorNodeRef}
      >
        <DragHandleDots2Icon className="opacity-50" />
      </button>
      <label className="w-full">
        <input
          className="block w-full p-2 text-gray-900 border border-gray-300 rounded-lg bg-gray-50 text-xs focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
          type="text"
          placeholder="option_value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <label className={clsx(mode === "simple" && "hidden", "w-full")}>
        <input
          className={
            "block w-full p-2 text-gray-900 border border-gray-300 rounded-lg bg-gray-50 text-xs focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
          }
          type="text"
          placeholder="Option Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>

      <button type="button" onClick={onRemove}>
        <TrashIcon />
      </button>
    </div>
  );
}

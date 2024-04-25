"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
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
  Option,
} from "@/types";
import { LockClosedIcon } from "@radix-ui/react-icons";
import { FormFieldAssistant } from "../ai/form-field-schema-assistant";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import toast from "react-hot-toast";
import { arrayMove } from "@dnd-kit/sortable";
import { draftid } from "@/utils/id";
import { OptionsEdit } from "../options/options-edit";
import { OptionsStockEdit } from "../options/options-sku";
import { Switch } from "@/components/ui/switch";
import { InventoryStock } from "@/types/inventory";
import { INITIAL_INVENTORY_STOCK } from "@/k/inventory_defaults";

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
      { id: draftid(), label: "Option A", value: "option_a" },
      { id: draftid(), label: "Option B", value: "option_b" },
      { id: draftid(), label: "Option C", value: "option_c" },
    ],
  },
  password: { type: "password", placeholder: "Password" },
  color: { type: "color" },
  radio: {
    type: "radio",
    options: [
      { id: draftid(), label: "Option A", value: "option_a" },
      { id: draftid(), label: "Option B", value: "option_b" },
      { id: draftid(), label: "Option C", value: "option_c" },
    ],
  },
  checkboxes: {
    type: "checkboxes",
    options: [
      { id: draftid(), label: "Choice A", value: "choice_a" },
      { id: draftid(), label: "Choice B", value: "choice_b" },
      { id: draftid(), label: "Choice C", value: "choice_c" },
    ],
    multiple: true,
    // TODO: checkboxes is a non-standard HTML input type, we have no way to handle the required attribute with built-in HTML validation
    // https://github.com/whatwg/html/issues/6868
    required: false,
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

const input_can_have_options: FormFieldType[] = [
  "select",
  "radio",
  "checkboxes",
];

const input_can_have_pattern: FormFieldType[] = supported_field_types.filter(
  (type) => !["checkbox", "checkboxes", "color", "radio"].includes(type)
);

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
  const [inventoryEnabled, setInventoryEnabled] = useState(false);
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
  const [options, setOptions] = useState<Option[]>(
    Array.from(init?.options ?? []).sort(
      (a, b) => (a.index || 0) - (b.index || 0)
    )
  );

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

  const [stocksMap, setStocksMap] = useState<{
    [key: string]: InventoryStock;
  }>(
    Object.fromEntries(
      options.map((o) => [
        o.id,
        {
          available: INITIAL_INVENTORY_STOCK,
          on_hand: INITIAL_INVENTORY_STOCK,
          committed: 0,
          unavailable: 0,
          incoming: 0,
        },
      ])
    )
  );

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

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const indexed_options = options
      .map((option, index) => ({
        ...option,
        index,
      }))
      .sort((a, b) => a.index - b.index);

    onSave?.({
      name,
      label,
      placeholder,
      helpText,
      type,
      required,
      pattern,
      options: indexed_options,
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
        setMultiple((_multiple) => _multiple || defaults.multiple || false);
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
                  preview
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
        <form key={formResetKey} id="field-edit-form" onSubmit={onSubmit}>
          <PanelPropertySection>
            <PanelPropertySectionTitle>Field</PanelPropertySectionTitle>
            <PanelPropertyFields>
              <PanelPropertyField label={"Type"}>
                <Select
                  value={type}
                  onValueChange={(value) => {
                    set_effect_cause("human");
                    setType(value as FormFieldType);
                  }}
                >
                  <SelectTrigger id="category" aria-label="Select category">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {supported_field_types.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
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
                  onValueChange={(value) => {
                    setData({
                      ...data,
                      type: "payment",
                      service_provider: value,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="service provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {payments_service_providers.map((provider) => (
                      <SelectItem
                        key={provider}
                        value={provider ?? payments_service_providers_default}
                      >
                        {payments_service_providers_display_map[provider].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PanelPropertyField>
            </PanelPropertyFields>
          </PanelPropertySection>
          <PanelPropertySection hidden={!has_options}>
            <PanelPropertySectionTitle>Options</PanelPropertySectionTitle>
            <PanelPropertyFields>
              <OptionsEdit
                options={options}
                onAdd={() => {
                  setOptions([
                    ...options,
                    {
                      id: draftid(),
                      value: `option_${options.length + 1}`,
                      label: `Option ${options.length + 1}`,
                    },
                  ]);
                }}
                onChange={(id, option) => {
                  setOptions(
                    options.map((_option: Option) =>
                      _option.id && _option.id === id ? option : _option
                    )
                  );
                }}
                onRemove={(id) => {
                  setOptions(options.filter((_) => _.id !== id));
                }}
                onSort={(from, to) => {
                  setOptions(arrayMove(options, from, to));
                }}
              />
            </PanelPropertyFields>
          </PanelPropertySection>
          <PanelPropertySection hidden={type !== "select"}>
            <PanelPropertySectionTitle>Store</PanelPropertySectionTitle>
            <PanelPropertyFields>
              <PanelPropertyField
                label={"Track Inventory"}
                description="Enabiling Inventory will allow you to track stock levels for each option."
              >
                <Switch
                  checked={inventoryEnabled}
                  onCheckedChange={setInventoryEnabled}
                />
              </PanelPropertyField>
              {inventoryEnabled && (
                <>
                  <PanelPropertySectionTitle>
                    Inventory
                  </PanelPropertySectionTitle>
                  <PanelPropertyFields>
                    <OptionsStockEdit
                      options={options.map((option) => {
                        return {
                          ...option,
                          ...stocksMap[option.id],
                        };
                      })}
                      onChange={(id, stock) => {
                        setStocksMap({
                          ...stocksMap,
                          [id]: {
                            ...stocksMap[id],
                            ...stock,
                          },
                        });
                      }}
                    />
                  </PanelPropertyFields>
                </>
              )}
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
              {type !== "checkbox" && (
                <PanelPropertyField
                  label={"Placeholder"}
                  description={
                    <>
                      {type === "select" ? (
                        <>
                          The placeholder text that will be displayed in the
                          input when no option is selected.
                        </>
                      ) : (
                        <>
                          The placeholder text that will be displayed in the
                          input when it&apos;s empty.
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
              )}
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
                  value={autocomplete ? autocomplete[0] : ""}
                  onValueChange={(value) => {
                    setAutocomplete([value as FormFieldAutocompleteType]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="autocomplete" />
                  </SelectTrigger>
                  <SelectContent>
                    {supported_field_autocomplete_types.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PanelPropertyField>
              {html5_multiple_supported_field_types.includes(type) && (
                <PanelPropertyField label={"Multiple"}>
                  <Toggle value={multiple} onChange={setMultiple} />
                </PanelPropertyField>
              )}
              {type !== "checkbox" && (
                <PanelPropertyField
                  label={"Required"}
                  description={
                    type === "checkboxes" ? (
                      <>
                        We follow html5 standards. Checkboxes cannot be
                        required.{" "}
                        <a
                          className="underline"
                          href="https://github.com/whatwg/html/issues/6868#issue-946624070"
                          target="_blank"
                        >
                          Learn more
                        </a>
                      </>
                    ) : undefined
                  }
                  disabled={type === "checkboxes"}
                >
                  <Toggle value={required} onChange={setRequired} />
                </PanelPropertyField>
              )}
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
        <button
          type="submit"
          form="field-edit-form"
          className={cls_save_button}
        >
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

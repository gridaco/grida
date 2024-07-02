"use client";

import React, { useCallback, useEffect, useState } from "react";
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
import FormFieldPreview from "@/components/formfield";
import {
  FormFieldAutocompleteType,
  FormFieldDataSchema,
  FormInputType,
  FormFieldInit,
  PaymentFieldData,
  Option,
  FormFieldStorageSchema,
  GridaSupabase,
  FormFieldReferenceSchema,
} from "@/types";
import { FormFieldAssistant } from "../ai/form-field-schema-assistant";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  FieldSupports,
  supported_field_autocomplete_types,
  supported_field_types,
} from "@/k/supported_field_types";
import {
  payments_service_providers,
  payments_service_providers_default,
  payments_service_providers_display_map,
} from "@/k/payments_service_providers";
import { fmt_snake_case_to_human_text } from "@/utils/fmt";
import toast from "react-hot-toast";
import { arrayMove } from "@dnd-kit/sortable";
import { draftid } from "@/utils/id";
import { OptionsEdit } from "../options/options-edit";
import { OptionsStockEdit } from "../options/options-sku";
import { Switch } from "@/components/ui/switch";
import { FormFieldUpsert } from "@/types/private/api";
import { useEditorState } from "../editor";
import { useRouter } from "next/navigation";
import { editorlink } from "@/lib/forms/url";
import { cn } from "@/utils";
import { FormFieldTypeIcon } from "@/components/form-field-type-icon";
import { useInventory, useInventoryState } from "../options/use-inventory";
import Link from "next/link";
import { SupabaseLogo } from "@/components/logos";
import { Spinner } from "@/components/spinner";
import { NameInput } from "./name-input";
import { LockClosedIcon, ReloadIcon } from "@radix-ui/react-icons";
import { PrivateEditorApi } from "@/lib/private";
import { Badge } from "@/components/ui/badge";

// @ts-ignore
const default_field_init: {
  [key in FormInputType]: Partial<FormFieldInit>;
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

export type FormFieldSave = Omit<FormFieldUpsert, "form_id">;

export function TypeSelect({
  value,
  onValueChange,
}: {
  value: FormInputType;
  onValueChange: (value: FormInputType) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between capitalize"
        >
          <div className="flex gap-2 items-center">
            <FormFieldTypeIcon type={value} className="w-4 h-4" />
            {value ? value : "Type"}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] max-h-[--radix-popover-content-available-height] p-0">
        <Command>
          <CommandInput placeholder="Search" />
          <CommandEmpty>No input found.</CommandEmpty>
          <CommandList>
            <CommandGroup>
              {supported_field_types.map((t) => (
                <CommandItem
                  key={t}
                  value={t}
                  onSelect={(currentValue) => {
                    onValueChange(currentValue as FormInputType);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === t ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex items-center gap-2">
                    <FormFieldTypeIcon type={t} className="w-4 h-4" />
                    <span className="capitalize">{t}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

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
  init?: Partial<FormFieldInit>;
  mode?: "edit" | "new";
  enableAI?: boolean;
  onSave?: (field: FormFieldSave) => void;
}) {
  const is_edit_mode = !!init?.id;
  const [state] = useEditorState();
  const router = useRouter();
  const [effect_cause, set_effect_cause] = useState<"ai" | "human" | "system">(
    "system"
  );
  // columns
  const [type, setType] = useState<FormInputType>(init?.type || "text");
  const [name, setName] = useState(init?.name || "");
  const [label, setLabel] = useState(init?.label || "");
  const [placeholder, setPlaceholder] = useState(init?.placeholder || "");
  const [helpText, setHelpText] = useState(init?.help_text || "");
  const [required, setRequired] = useState(init?.required || false);
  const [readonly, setReadonly] = useState(init?.readonly || false);
  const [pattern, setPattern] = useState<string | undefined>(init?.pattern);

  // numeric
  const [step, setStep] = useState<number | undefined>(init?.step);
  const [min, setMin] = useState<number | undefined>(init?.min);
  const [max, setMax] = useState<number | undefined>(init?.max);

  // options
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

  const [storage_enabled, __set_storage_enabled] = useState(!!init?.storage);
  const [storage, setStorage] = useState<
    Partial<FormFieldStorageSchema | null | undefined>
  >(init?.storage);

  const [reference_enabled, __set_reference_enabled] = useState(
    !!init?.reference
  );
  const [reference, setReference] = useState<
    Partial<FormFieldReferenceSchema | null | undefined>
  >(init?.reference);

  const preview_label = buildPreviewLabel({
    name,
    label,
  });

  const { inventory: initial_inventory, loading: inventory_loading } =
    useInventory(options);
  const [is_inventory_enabled, __set_inventory_enabled] = useState(false);
  const [inventory, setInventory] = useInventoryState(
    options,
    initial_inventory,
    is_inventory_enabled
  );

  useEffect(() => {
    if (!inventory_loading && initial_inventory) {
      __set_inventory_enabled(true);
    }
  }, [initial_inventory, inventory_loading]);

  const enable_inventory = (checked: boolean) => {
    // check if store is connected
    if (state.connections.store_id) {
      if (checked) __set_inventory_enabled(true);
    } else {
      const ok = confirm(
        "You need to connect a store to enable inventory tracking"
      );
      if (ok) {
        const connect_redirect_link = editorlink(
          window.location.origin,
          state.form_id,
          "connect/store"
        );
        console.log("redirecting to", connect_redirect_link);
        props.onOpenChange?.(false);
        router.push(connect_redirect_link);
      }
    }
  };

  const supports_options = FieldSupports.options(type);
  const supports_pattern = FieldSupports.pattern(type);
  const supports_numeric = FieldSupports.numeric(type);
  const supports_accept = FieldSupports.accept(type);

  const preview_placeholder =
    placeholder ||
    fmt_snake_case_to_human_text(label) ||
    fmt_snake_case_to_human_text(name);

  const preview_disabled =
    type == "payment" &&
    // disable preview if servive provider is tosspayments (it takes control over the window)
    (data as PaymentFieldData)?.service_provider === "tosspayments";

  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const indexed_options = options
      .map((option, index) => ({
        ...option,
        index,
      }))
      .sort((a, b) => a.index - b.index);

    const options_inventory_upsert_diff = is_inventory_enabled
      ? Object.fromEntries(
          Object.entries(inventory ?? {}).map(([id, stock]) => [
            id,
            {
              diff: stock.available - (initial_inventory?.[id]?.available || 0),
            },
          ])
        )
      : undefined;

    onSave?.({
      name,
      label,
      placeholder,
      help_text: helpText,
      type,
      required,
      readonly,
      pattern: supports_pattern ? pattern : undefined,
      step,
      min,
      max,
      options: supports_options ? indexed_options : undefined,
      autocomplete,
      data,
      accept,
      multiple,
      options_inventory: options_inventory_upsert_diff,
      storage: storage_enabled ? storage : undefined,
      reference: reference_enabled ? reference : undefined,
    });
  };

  const onSuggestion = (schema: FormFieldInit) => {
    set_effect_cause("ai");

    setName(schema.name);
    setLabel(schema.label);
    setPlaceholder(schema.placeholder);
    setHelpText(schema.help_text);
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
        setHelpText((_help) => _help || defaults.help_text || "");
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
            <div className="relative w-full min-h-40 bg-card rounded p-10 border">
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
                  readonly={readonly}
                  requiredAsterisk
                  disabled={preview_disabled}
                  options={supports_options ? options : undefined}
                  pattern={pattern}
                  step={step}
                  min={min}
                  max={max}
                  autoComplete={autocomplete.join(" ")}
                  data={data}
                  accept={accept}
                  multiple={multiple}
                />
                <div className="absolute bottom-0 right-0 m-2">
                  <div className="font-mono flex gap-2">
                    <button type="submit">
                      <Badge variant="secondary">Test</Badge>
                    </button>
                    <button type="reset">
                      <Badge className="h-full" variant="secondary">
                        <ReloadIcon className="w-3 h-3" />
                      </Badge>
                    </button>
                  </div>
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
        <form key={formResetKey} id="field-edit-form" onSubmit={save}>
          <PanelPropertySection>
            <PanelPropertySectionTitle>Field</PanelPropertySectionTitle>
            <PanelPropertyFields>
              <PanelPropertyField label={"Type"}>
                <TypeSelect
                  value={type}
                  onValueChange={(value) => {
                    set_effect_cause("human");
                    setType(value);
                  }}
                />
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
                <NameInput
                  autoFocus={mode === "new"}
                  value={name}
                  onValueChange={setName}
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
          <PanelPropertySection hidden={!supports_options}>
            <PanelPropertySectionTitle>Options</PanelPropertySectionTitle>
            <PanelPropertyFields>
              <OptionsEdit
                disableNewOption={is_inventory_enabled}
                options={options}
                onAdd={() => {
                  setOptions([...options, next_option_default(options)]);
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
          <PanelPropertySection hidden={type !== "select" || !is_edit_mode}>
            <PanelPropertySectionTitle>Store</PanelPropertySectionTitle>
            <PanelPropertyFields>
              {inventory_loading ? (
                <>{/*  */}</>
              ) : (
                <>
                  <PanelPropertyField
                    label={"Track Inventory"}
                    description="Enabiling Inventory will allow you to track stock levels for each option. (This cannot be disabled once enabled)"
                  >
                    <Switch
                      checked={is_inventory_enabled}
                      disabled={is_inventory_enabled} // cannot disable once enabled
                      onCheckedChange={enable_inventory}
                    />
                  </PanelPropertyField>
                  {is_inventory_enabled && (
                    <>
                      <PanelPropertySectionTitle>
                        Inventory
                      </PanelPropertySectionTitle>
                      <PanelPropertyFields>
                        {inventory && (
                          <OptionsStockEdit
                            options={options.map((option) => {
                              return {
                                ...option,
                                ...inventory[option.id],
                              };
                            })}
                            onChange={(id, stock) => {
                              setInventory({
                                ...inventory,
                                [id]: {
                                  ...inventory[id],
                                  ...stock,
                                },
                              });
                            }}
                          />
                        )}
                      </PanelPropertyFields>
                    </>
                  )}
                </>
              )}
            </PanelPropertyFields>
          </PanelPropertySection>
          <PanelPropertySection hidden={type == "payment" || type == "hidden"}>
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
              {FieldSupports.placeholder(type) && (
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
              {FieldSupports.autocomplete(type) && (
                <PanelPropertyField
                  label={"Auto Complete"}
                  help={
                    <>
                      <Link
                        href="https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete"
                        target="_blank"
                      >
                        Learn more
                      </Link>
                    </>
                  }
                >
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
              )}
              {FieldSupports.multiple(type) && (
                <PanelPropertyField
                  label={"Multiple"}
                  help={
                    <>
                      <Link
                        href="https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/multiple"
                        target="_blank"
                      >
                        Learn more
                      </Link>
                    </>
                  }
                >
                  <Switch checked={multiple} onCheckedChange={setMultiple} />
                </PanelPropertyField>
              )}
              {FieldSupports.readonly(type) && (
                <PanelPropertyField
                  label={"Readonly"}
                  help={
                    <>
                      Because a read-only field cannot have its value changed by
                      a user interaction,{" "}
                      <Link
                        href="https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/readonly"
                        target="_blank"
                      >
                        required
                      </Link>{" "}
                      does not have any effect on inputs with the readonly
                      attribute also specified.{" "}
                      <Link
                        href="https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/readonly#attribute_interactions"
                        target="_blank"
                      >
                        (MDN)
                      </Link>
                    </>
                  }
                >
                  <Switch checked={readonly} onCheckedChange={setReadonly} />
                </PanelPropertyField>
              )}
              {!FieldSupports.checkbox_alias(type) && type !== "range" && (
                <PanelPropertyField
                  label={"Required"}
                  help={
                    <>
                      <Link
                        href="https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/required"
                        target="_blank"
                      >
                        Learn more
                      </Link>
                    </>
                  }
                  description={
                    FieldSupports.checkbox_alias(type) ? (
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
                  <Switch checked={required} onCheckedChange={setRequired} />
                </PanelPropertyField>
              )}
            </PanelPropertyFields>
          </PanelPropertySection>

          <PanelPropertySection
            hidden={
              type == "payment" ||
              (!supports_accept &&
                !supports_pattern &&
                !supports_numeric &&
                !FieldSupports.checkbox_alias(type))
            }
          >
            <PanelPropertySectionTitle>Validation</PanelPropertySectionTitle>
            <PanelPropertyFields>
              {supports_accept && (
                <PanelPropertyField
                  label={"Accept"}
                  help={
                    <>
                      <Link
                        href="https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/accept"
                        target="_blank"
                      >
                        Learn more
                      </Link>
                    </>
                  }
                  description="A comma-separated list of file types that the input should accept"
                >
                  <PropertyTextInput
                    placeholder={"image/*"}
                    value={accept}
                    onChange={(e) => setAccept(e.target.value)}
                  />
                </PanelPropertyField>
              )}
              {supports_pattern && (
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
              {supports_numeric && (
                <>
                  <PanelPropertyField
                    label={"Step"}
                    description="Defines the intervals for the slider values."
                  >
                    <PropertyTextInput
                      type="number"
                      placeholder="1"
                      value={step}
                      onChange={(e) =>
                        setStep(
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value)
                        )
                      }
                    />
                  </PanelPropertyField>
                  <PanelPropertyField
                    label={"Min"}
                    description="Sets the minimum value for the slider."
                  >
                    <PropertyTextInput
                      type="number"
                      placeholder="E.g. -100"
                      value={min}
                      onChange={(e) =>
                        setMin(
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value)
                        )
                      }
                    />
                  </PanelPropertyField>
                  <PanelPropertyField
                    label={"Max"}
                    description="Sets the maximum value for the slider."
                  >
                    <PropertyTextInput
                      type="number"
                      placeholder="E.g. 100"
                      value={max}
                      onChange={(e) =>
                        setMax(
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value)
                        )
                      }
                    />
                  </PanelPropertyField>
                </>
              )}
              {FieldSupports.checkbox_alias(type) && (
                <PanelPropertyField
                  label={"Check Required"}
                  description={
                    <>
                      The checkbox / switch will be required if it is checked.
                      The user must check the checkbox / switch to continue.
                    </>
                  }
                >
                  <Switch checked={required} onCheckedChange={setRequired} />
                </PanelPropertyField>
              )}
            </PanelPropertyFields>
          </PanelPropertySection>
          <PanelPropertySection hidden={type !== "hidden"}>
            <PanelPropertySectionTitle>Hidden Field</PanelPropertySectionTitle>
            <PanelPropertyFields>
              <PanelPropertyField
                label={"Required"}
                description={
                  <>
                    When checked, the field will be required. Developer must set
                    a value for this field before via SDK or URL Params.
                  </>
                }
              >
                <Switch checked={required} onCheckedChange={setRequired} />
              </PanelPropertyField>
            </PanelPropertyFields>
          </PanelPropertySection>
          {FieldSupports.file_upload(type) && state.connections.supabase && (
            <>
              <hr />
              <SupabaseStorageSettings
                value={storage}
                onValueChange={setStorage}
                enabled={storage_enabled}
                onEnabledChange={__set_storage_enabled}
              />
            </>
          )}
          {FieldSupports.fk(type) && state.connections.supabase && !!name && (
            <>
              <hr />
              <SupabaseReferencesSettings
                format={
                  state.connections.supabase.main_supabase_table
                    ?.sb_table_schema?.properties?.[name]?.format
                }
                value={reference}
                onValueChange={setReference}
                enabled={reference_enabled}
                onEnabledChange={__set_reference_enabled}
              />
            </>
          )}
        </form>
      </PanelContent>
      <PanelFooter>
        <PanelClose>
          <Button variant="ghost">Cancel</Button>
        </PanelClose>
        <Button variant="default" type="submit" form="field-edit-form">
          Save
        </Button>
      </PanelFooter>
    </SidePanel>
  );
}

function SupabaseStorageSettings({
  value,
  onValueChange,
  enabled,
  onEnabledChange,
}: {
  value?: Partial<FormFieldStorageSchema> | null | undefined;
  onValueChange?: (value: Partial<FormFieldStorageSchema>) => void;
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
}) {
  const [state] = useEditorState();
  const [buckets, setBuckets] = useState<GridaSupabase.SupabaseBucket[]>();
  const [bucket, setBucket] = useState<string | undefined>(value?.bucket);
  const [path, setPath] = useState<string | undefined>(value?.path);
  const [mode, setMode] = useState<FormFieldStorageSchema["mode"]>(
    value?.mode ?? "direct"
  );

  useEffect(() => {
    // check if path contains template

    onValueChange?.({
      type: "x-supabase",
      bucket,
      mode: isHandlebarTemplate(path) ? "staged" : mode,
      path,
    });
  }, [enabled, bucket, mode, path, onValueChange]);

  // list buckets
  useEffect(() => {
    if (enabled) {
      PrivateEditorApi.SupabaseConnection.listBucket(state.form_id).then(
        (res) => {
          res.data.data && setBuckets(res.data.data);
        }
      );
    }
  }, [enabled, state.form_id]);

  useEffect(() => {
    setBucket(value?.bucket);
    setMode(value?.mode ?? "direct");
    setPath(value?.path);
  }, [value]);

  return (
    <PanelPropertySection>
      <PanelPropertySectionTitle>
        <SupabaseLogo className="inline me-2 w-5 h-5 align-middle" />
        Supabase Storage
      </PanelPropertySectionTitle>
      <PanelPropertyFields>
        <PanelPropertyField
          label={"Enabled Storage"}
          description="Enable Supabase Storage to store files in your Supabase project. (Required)"
        >
          <Switch
            // IMPORTANT: the custom storage is required since we do not provide a alternate cdn solution. built in storage works only with a 'response' model, where we can't enforce this on x-supabase connection.
            required
            checked={enabled}
            onCheckedChange={onEnabledChange}
          />
        </PanelPropertyField>
        {enabled && (
          <>
            <PanelPropertyField
              label={"Bucket"}
              description="The bucket name to upload the file to."
            >
              {buckets ? (
                <>
                  <Select
                    required
                    value={bucket}
                    onValueChange={(value) => setBucket(value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Bucket" />
                    </SelectTrigger>
                    <SelectContent>
                      {buckets?.map((bucket) => (
                        <SelectItem key={bucket.id} value={bucket.id}>
                          <span>
                            {bucket.name}
                            <small className="ms-2 text-muted-foreground">
                              {bucket.public ? "public" : ""}
                            </small>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <>
                  <Select required disabled>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          <div className="flex gap-2">
                            <Spinner /> Loading...
                          </div>
                        }
                      />
                    </SelectTrigger>
                  </Select>
                </>
              )}
            </PanelPropertyField>
            <PanelPropertyField
              label={"Upload Path"}
              description="The file upload path. (Leave leading and trailing slashes off)"
            >
              <PropertyTextInput
                placeholder="public/{{RECORD.id}}/photos/{{file.name}}"
                value={path}
                required
                pattern="^(?!\/).*"
                onChange={(e) => setPath(e.target.value)}
              />
            </PanelPropertyField>
            <PanelPropertyField
              label={"Staged Uploading"}
              help={
                <>
                  Staged uploading allows you to upload first under{" "}
                  <code>tmp/[session]/</code>
                  folder and then move to the final destination. This is useful
                  when you want to upload files under <code>path/to/[id]/</code>
                  and you don&apos;t have the <code>id</code> yet.
                </>
              }
              description={
                <>
                  Use staged uploading to upload first, then move to final path
                  once transaction is complete.
                </>
              }
            >
              <Switch
                checked={mode === "staged"}
                onCheckedChange={(checked) =>
                  setMode(checked ? "staged" : "direct")
                }
              />
            </PanelPropertyField>
          </>
        )}
      </PanelPropertyFields>
    </PanelPropertySection>
  );
}

function SupabaseReferencesSettings({
  format,
  value,
  onValueChange,
  enabled,
  onEnabledChange,
}: {
  format?: string;
  value?: Partial<FormFieldReferenceSchema> | null | undefined;
  onValueChange?: (value: Partial<FormFieldReferenceSchema>) => void;
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
}) {
  const [state] = useEditorState();

  const { supabase_project } = state.connections.supabase!;

  const { schema, table, column } = value || {};

  const onTableChange = useCallback(
    (table: string) => {
      const [schema, _table] = table.split(".");

      onValueChange?.({
        type: "x-supabase",
        schema,
        table: _table,
        column: undefined,
      });
    },
    [onValueChange]
  );

  const onColumnCahnge = useCallback(
    (column: string) => {
      onValueChange?.({
        type: "x-supabase",
        schema,
        table,
        column,
      });
    },
    [onValueChange, schema, table]
  );

  const fulltable = `${schema}.${table}`;

  return (
    <PanelPropertySection>
      <PanelPropertySectionTitle>
        <SupabaseLogo className="inline me-2 w-5 h-5 align-middle" />
        Supabase Foreign Key
      </PanelPropertySectionTitle>
      <PanelPropertyFields>
        <PanelPropertyField
          label={"Enable Foreign Key Search"}
          description="Enable Supabase Foreign Key Search to reference data from your Supabase project."
        >
          <Switch checked={enabled} onCheckedChange={onEnabledChange} />
        </PanelPropertyField>
        {enabled && (
          <>
            <PanelPropertyField
              label={"Reference Table"}
              description="The table to reference data from."
            >
              <Select value={fulltable} onValueChange={onTableChange}>
                <SelectTrigger>
                  <SelectValue placeholder={"Select Table"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auth.users">
                    <span>auth.users</span>
                  </SelectItem>
                  {Object.keys(supabase_project.sb_public_schema!)?.map(
                    (key) => {
                      const fulltable = `public.${key}`;
                      return (
                        <SelectItem key={fulltable} value={fulltable}>
                          <span>{fulltable}</span>
                        </SelectItem>
                      );
                    }
                  )}
                </SelectContent>
              </Select>
            </PanelPropertyField>
            <PanelPropertyField
              label={"Column"}
              description="The column to reference data from."
            >
              <Select
                // setting this to undefined will throw (don't know why)
                value={column ?? ""}
                onValueChange={onColumnCahnge}
              >
                <SelectTrigger>
                  <SelectValue placeholder={"Select Column"} />
                </SelectTrigger>
                <SelectContent>
                  {table &&
                    (schema === "auth" && table === "users" ? (
                      <>
                        {Object.keys(
                          GridaSupabase.SupabaseUserJsonSchema.properties
                        ).map((key) => {
                          const property =
                            GridaSupabase.SupabaseUserJsonSchema.properties[
                              key as GridaSupabase.SupabaseUserColumn
                            ];
                          return (
                            <SelectItem
                              disabled={format !== property.format}
                              key={key}
                              value={key}
                            >
                              <span>{key}</span>{" "}
                              <small className="ms-1 text-muted-foreground">
                                {property.type} | {property.format}
                              </small>
                            </SelectItem>
                          );
                        })}
                      </>
                    ) : (
                      <>
                        {Object.keys(
                          supabase_project.sb_public_schema![table]
                            ?.properties ?? {}
                        )?.map((key) => {
                          const property =
                            supabase_project.sb_public_schema![table]
                              .properties?.[key];
                          return (
                            <SelectItem
                              disabled={format !== property.format}
                              key={key}
                              value={key}
                            >
                              <span>{key}</span>{" "}
                              <small className="ms-1 text-muted-foreground">
                                {property.type} | {property.format}
                              </small>
                            </SelectItem>
                          );
                        })}
                      </>
                    ))}
                </SelectContent>
              </Select>
            </PanelPropertyField>
          </>
        )}
      </PanelPropertyFields>
    </PanelPropertySection>
  );
}

function isHandlebarTemplate(str?: string) {
  if (!str) return false;
  const handlebarRegex = /\{\{[^{}]*\}\}/;
  return handlebarRegex.test(str);
}

function next_option_default(options: Option[]): Option {
  const len = options.length;
  const val = (n: number) => `option_${n}`;

  let n = len + 1;
  while (options.some((_) => _.value === val(n))) {
    n++;
  }

  return {
    id: draftid(),
    value: val(n),
    label: `Option ${n}`,
    disabled: false,
  };
}

function buildPreviewLabel({ name, label }: { name: string; label?: string }) {
  let txt = label || fmt_snake_case_to_human_text(name);
  return txt;
}

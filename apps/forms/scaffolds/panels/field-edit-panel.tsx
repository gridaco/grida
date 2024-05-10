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
  FormInputType,
  FormFieldInit,
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
import { FormFieldUpsert } from "@/types/private/api";
import { GridaCommerceClient } from "@/services/commerce";
import { useEditorState } from "../editor";
import {
  createClientFormsClient,
  createClientCommerceClient,
} from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { editorlink } from "@/lib/forms/url";
import { cn } from "@/utils";
import { FormFieldTypeIcon } from "@/components/form-field-type-icon";

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

const input_can_have_options: FormInputType[] = [
  "select",
  "radio",
  "checkboxes",
];

const html5_input_like_checkbox_field_types: FormInputType[] = [
  "checkbox",
  "switch",
];

/**
 * html5 pattern allowed input types
 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/pattern
 */
const input_can_have_pattern: FormInputType[] = [
  "text",
  "tel",
  // `date` uses pattern on fallback - https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/date#handling_browser_support
  "date",
  "email",
  "url",
  "password",
  // "search", // not supported
];

const input_can_have_autocomplete: FormInputType[] =
  supported_field_types.filter(
    (type) =>
      ![
        "file",
        "checkbox",
        "checkboxes",
        "switch",
        "radio",
        "range",
        "hidden",
        "payment",
      ].includes(type)
  );

export type FormFieldSave = Omit<FormFieldUpsert, "form_id">;

function useCommerceClient() {
  const [state] = useEditorState();

  const supabase = useMemo(() => createClientCommerceClient(), []);

  const commerce = useMemo(
    () =>
      new GridaCommerceClient(
        supabase,
        state.connections.project_id,
        state.connections.store_id
      ),
    [supabase, state.connections.project_id, state.connections.store_id]
  );

  return commerce;
}

function useInventory(options: Option[]) {
  const [state] = useEditorState();
  const commerce = useCommerceClient();
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<{
    [key: string]: InventoryStock;
  } | null>(null);

  useEffect(() => {
    setLoading(true);

    if (!state.connections.store_id) {
      setLoading(false);
      return;
    }

    console.log("fetching inventory");
    commerce
      .fetchInventoryItemsRPC()
      .then(({ data, error }) => {
        if (error) console.error(error);
        if (!data) return;

        // filter out items that are not in the options list
        const filtered_data = data.filter((item) =>
          options.some((option) => option.id === item.sku)
        );

        if (filtered_data.length === 0) {
          return;
        }

        const inventorymap = options.reduce(
          (acc: { [sku: string]: InventoryStock }, option) => {
            const item = filtered_data.find((_) => _.sku === option.id);
            if (item) {
              acc[item.sku] = {
                available: item.available,
                on_hand: item.available, // TODO:
                committed: item.committed,
                unavailable: 0,
                incoming: 0,
              };
            } else {
              acc[option.id] = {
                available: 0,
                on_hand: 0,
                committed: 0,
                unavailable: 0,
                incoming: 0,
              };
            }
            return acc;
          },
          {}
        );
        setInventory(inventorymap);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [commerce, options, state.connections.store_id]);

  return { inventory, loading };
}

function useInventoryState(
  options: Option[],
  _inventory: { [key: string]: InventoryStock } | null,
  enabled: boolean
) {
  const [inventory, setInventory] = useState<{
    [key: string]: InventoryStock;
  } | null>(_inventory);

  useEffect(() => {
    if (enabled) {
      setInventory(_inventory);

      if (!_inventory) {
        const initialmap = options.reduce(
          (acc: { [sku: string]: InventoryStock }, option) => {
            acc[option.id] = {
              available: INITIAL_INVENTORY_STOCK,
              on_hand: INITIAL_INVENTORY_STOCK,
              committed: 0,
              unavailable: 0,
              incoming: 0,
            };
            return acc;
          },
          {}
        );
        setInventory(initialmap);
      }
    }
  }, [_inventory, options, enabled]);

  return [inventory, setInventory] as const;
}

export function TypeSelect({
  value,
  onValueChange,
}: {
  value: FormInputType;
  onValueChange: (value: FormInputType) => void;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id="type" aria-label="Select Field Type">
        <SelectValue placeholder="Type" />
      </SelectTrigger>
      <SelectContent>
        {supported_field_types.map((type) => (
          <SelectItem key={type} value={type}>
            <div className="flex items-center gap-2">
              <FormFieldTypeIcon type={type} />{" "}
              <span className="capitalize">{type}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  // TODO: below won't display properly on panel
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[200px] justify-between"
        >
          {value
            ? supported_field_types.find((t) => t === value)
            : "Select input..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search framework..." />
          <CommandEmpty>No input found.</CommandEmpty>
          <CommandGroup>
            <CommandList>
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
                  {t}
                </CommandItem>
              ))}
            </CommandList>
          </CommandGroup>
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
  const [name, setName] = useState(init?.name || "");
  const [label, setLabel] = useState(init?.label || "");
  const [placeholder, setPlaceholder] = useState(init?.placeholder || "");
  const [helpText, setHelpText] = useState(init?.help_text || "");
  const [type, setType] = useState<FormInputType>(init?.type || "text");
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
      pattern,
      options: indexed_options,
      autocomplete,
      data,
      accept,
      multiple,
      options_inventory: options_inventory_upsert_diff,
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
                  requiredAsterisk
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
              {input_can_have_autocomplete.includes(type) && (
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
              )}
              {html5_multiple_supported_field_types.includes(type) && (
                <PanelPropertyField label={"Multiple"}>
                  <Toggle value={multiple} onChange={setMultiple} />
                </PanelPropertyField>
              )}
              {!html5_input_like_checkbox_field_types.includes(type) &&
                type !== "range" && (
                  <PanelPropertyField
                    label={"Required"}
                    description={
                      html5_input_like_checkbox_field_types.includes(type) ? (
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
              (!has_accept &&
                !has_pattern &&
                !html5_input_like_checkbox_field_types.includes(type))
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
              {html5_input_like_checkbox_field_types.includes(type) && (
                <PanelPropertyField
                  label={"Required"}
                  description={
                    <>
                      The checkbox / switch will be required if it is checked.
                      The user must check the checkbox / switch to continue.
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

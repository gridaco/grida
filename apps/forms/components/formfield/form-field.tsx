import {
  FormFieldDataSchema,
  FormInputType,
  Option,
  PaymentFieldData,
} from "@/types";
import React, { useEffect, useState } from "react";
import { Select as HtmlSelect } from "../vanilla/select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SignatureCanvas } from "./signature-canvas";
import { StripePaymentFormFieldPreview } from "./form-field-preview-payment-stripe";
import { TossPaymentsPaymentFormFieldPreview } from "./form-field-preview-payment-tosspayments";
import clsx from "clsx";
import { ClockIcon, PlusIcon } from "@radix-ui/react-icons";
import { Checkbox } from "@/components/ui/checkbox";
import useSafeSelectValue from "./use-safe-select-value";
import { Switch } from "../ui/switch";
import { Slider } from "../ui/slider"; // TODO: this causes hydration error
import { Toggle } from "../ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Textarea } from "../ui/textarea";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Label } from "../ui/label";
import {
  FileUploadField,
  getMaxUploadSize,
  makeResolver,
  makeUploader,
} from "./file-upload-field";
import {
  GRIDA_FORMS_RESPONSE_BUCKET_UPLOAD_LIMIT,
  GRIDA_FORMS_RESPONSE_FILES_MAX_COUNT_PER_FIELD,
  GRIDA_FORMS_RESPONSE_MULTIPART_FILE_UOLOAD_LIMIT,
} from "@/k/env";
import type { FileResolveStrategy, FileUploadStrategy } from "@/lib/forms";
import assert from "assert";
import {
  ReferenceSearch,
  ReferenceSearchPreview,
} from "./reference-search-field";
import { PhoneField } from "./phone-field";
import { RichTextEditorField } from "./richtext-field";
import { FieldProperties } from "@/k/supported_field_types";

/**
 * this disables the auto zoom in input text tag safari on iphone by setting font-size to 16px
 * @see https://stackoverflow.com/questions/2989263/disable-auto-zoom-in-input-text-tag-safari-on-iphone
 */
const cls_input_ios_zoom_disable = "!text-base sm:!text-sm";

interface IInputField {
  id?: string;
  name: string;
  label?: string;
  type: FormInputType;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  readonly?: boolean;
  requiredAsterisk?: boolean;
  defaultValue?: string;
  options?: Option[];
  pattern?: string;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  autoComplete?: string;
  accept?: string;
  multiple?: boolean;
  labelCapitalize?: boolean;
  data?: FormFieldDataSchema | null;
  fileupload?: FileUploadStrategy;
  fileresolve?: FileResolveStrategy;
  onValueChange?: (value: string) => void;
  onCheckedChange?: (checked: boolean) => void;
}

interface IFormField extends IInputField {
  novalidate?: boolean;
  /**
   * disable auto mutation of value when locked.
   * by default, the input values are only modified by user input, thus, there is a exception for select input for extra validation (e.g. useSafeSelectValue)
   */
  locked?: boolean;
}

interface IMonoFormFieldRenderingProps extends IFormField {
  /**
   * use vanilla html5 input element only
   */
  vanilla?: boolean;
  /**
   * force render invisible field if true
   */
  preview?: boolean;
}

interface IFormFieldRenderingProps extends IMonoFormFieldRenderingProps {
  is_array?: boolean;
}

const __noop = (_: any) => _;

/**
 * @beta is_array=true is experimental and only works on playground
 * @returns
 */
function FormField({ is_array, ...props }: IFormFieldRenderingProps) {
  const [n, setN] = useState(1);
  if (is_array) {
    return (
      <>
        <div>
          <label>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setN((n) => n + 1);
              }}
            >
              <PlusIcon />
            </Button>
          </label>
          {Array.from({ length: n }).map((_, i) => (
            <MonoFormField key={i} {...props} />
          ))}
        </div>
      </>
    );
  }
  return <MonoFormField {...props} />;
}

function MonoFormField({
  id,
  name,
  label,
  labelCapitalize,
  type,
  placeholder,
  required,
  requiredAsterisk,
  defaultValue,
  options,
  helpText,
  readonly,
  disabled,
  autoComplete,
  accept,
  multiple,
  pattern,
  step,
  min,
  max,
  data,
  fileupload,
  fileresolve,
  novalidate,
  vanilla,
  locked,
  preview,
  onValueChange,
  onCheckedChange,
}: IMonoFormFieldRenderingProps) {
  const __onchange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    onValueChange?.(e.target.value);
  };

  const sharedInputProps: (
    | React.ComponentProps<"input">
    | React.ComponentProps<"textarea">
  ) &
    OnValueChange = {
    id: name,
    name: name,
    readOnly: readonly,
    disabled: disabled,
    autoFocus: false,
    placeholder: placeholder,
    autoComplete,
    accept,
    multiple,
    defaultValue: defaultValue,
    // form validation related
    required: novalidate ? false : required,
    pattern: novalidate ? undefined : pattern || undefined,
    // minLength: novalidate ? undefined : data?.min_length,
    // maxLength: novalidate ? undefined : data?.max_length,
    min: novalidate ? undefined : min,
    max: novalidate ? undefined : max,
    step: novalidate ? undefined : step,

    // extended
    onChange: __onchange,
  };

  function renderContent({
    name,
    label,
    src,
  }: {
    name: string;
    label?: string;
    src?: string | null;
  }) {
    return (
      <>
        <span>{label || name}</span>
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={label || name}
            className="mt-1 w-12 h-12 aspect-square rounded-sm"
          />
        )}
      </>
    );
  }

  function renderInput() {
    switch (type) {
      case "text":
      case "email":
      case "number":
      case "url":
      case "password": {
        if (vanilla) {
          return (
            <HtmlInput
              type={type}
              {...(sharedInputProps as React.ComponentProps<"input">)}
            />
          );
        }

        return (
          // @ts-ignore
          <Input
            type={type}
            {...(sharedInputProps as React.ComponentProps<"input">)}
          />
        );
      }
      case "textarea": {
        if (vanilla) {
          return (
            <HtmlTextarea
              {...(sharedInputProps as React.ComponentProps<"textarea">)}
            />
          );
        }

        return (
          // @ts-ignore
          <Textarea
            {...(sharedInputProps as React.ComponentProps<"textarea">)}
          />
        );
      }
      case "tel": {
        if (vanilla) {
          return (
            <HtmlInput
              type={type}
              {...(sharedInputProps as React.ComponentProps<"input">)}
            />
          );
        }

        if (process.env.NODE_ENV === "development") {
          // TODO: phone field is not ready yet due to lack of reliable way for setting initial country code
          return (
            // @ts-ignore
            <PhoneField
              {...(sharedInputProps as React.ComponentProps<"input">)}
            />
          );
        }

        return (
          // @ts-ignore
          <Input
            type={type}
            {...(sharedInputProps as React.ComponentProps<"input">)}
          />
        );
      }
      case "image":
      case "audio":
      case "video":
      case "file": {
        const accept =
          (sharedInputProps as React.ComponentProps<"input">).accept ??
          FieldProperties.accept(type);

        if (vanilla) {
          assert(
            fileupload?.type === "multipart" || fileupload?.type === undefined,
            "fileupload type must be multipart"
          );

          return (
            <HtmlFileInput
              type="file"
              {...(sharedInputProps as React.ComponentProps<"input">)}
              accept={accept}
            />
          );
        }

        return (
          <FileUploadField
            name={sharedInputProps.name}
            required={novalidate ? false : required}
            accept={accept}
            multiple={multiple}
            maxFiles={
              multiple ? GRIDA_FORMS_RESPONSE_FILES_MAX_COUNT_PER_FIELD : 1
            }
            maxSize={getMaxUploadSize(fileupload?.type)}
            uploader={makeUploader(fileupload)}
          />
        );
      }
      case "richtext": {
        return (
          <RichTextEditorField
            name={name}
            required={required}
            placeholder={placeholder}
            initialContent={defaultValue ? JSON.parse(defaultValue) : undefined}
            onContentChange={(content) => {
              onValueChange?.(JSON.stringify(content));
            }}
            uploader={makeUploader(fileupload)}
            resolver={makeResolver(fileresolve)}
          />
        );
      }
      case "select": {
        if (vanilla || multiple) {
          // html5 vanilla select
          // does not support `src`
          return (
            <HtmlSelectWithSafeValue
              {...(sharedInputProps as React.ComponentProps<"select">)}
              options={options}
              locked={locked}
              onValueChange={onValueChange}
            />
          );
        } else {
          if (multiple) {
            // TODO:
            return (
              <>invalid - non vanilla select cannot have property multiple</>
            );
          }

          return (
            <SelectWithSafeValue
              {...(sharedInputProps as React.ComponentProps<"select">)}
              options={options}
              locked={locked}
              onValueChange={onValueChange}
            />
          );
        }
      }
      case "radio": {
        if (vanilla) {
          return (
            <fieldset className="flex flex-col gap-1">
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
                    {renderContent({
                      name: option.value,
                      label: option.label,
                      src: option.src,
                    })}
                  </label>
                </div>
              ))}
            </fieldset>
          );
        }

        return (
          // @ts-ignore
          <RadioGroup
            {...(sharedInputProps as React.ComponentProps<"div">)}
            onValueChange={onValueChange}
            id={name}
            name={name}
          >
            {options?.map((option) => (
              <div key={option.id} className="flex items-center space-x-2">
                <RadioGroupItem id={option.id} value={option.id} />
                <label htmlFor={option.id}>
                  {renderContent({
                    name: option.value,
                    label: option.label,
                    src: option.src,
                  })}
                </label>
              </div>
            ))}
          </RadioGroup>
        );
      }
      case "checkbox": {
        return (
          // @ts-ignore
          <Checkbox
            {...(sharedInputProps as React.ComponentProps<"input">)}
            onCheckedChange={onCheckedChange}
          />
        );
      }
      case "toggle": {
        return (
          <fieldset>
            {/* @ts-ignore */}
            <Toggle
              {...(sharedInputProps as React.ComponentProps<"input">)}
              onPressedChange={onCheckedChange}
            >
              {label || name}
            </Toggle>
          </fieldset>
        );
      }
      case "switch": {
        return (
          // @ts-ignore
          <Switch
            {...(sharedInputProps as React.ComponentProps<"input">)}
            onCheckedChange={onCheckedChange}
          />
        );
      }
      case "time": {
        return (
          <div className="relative">
            <div className="absolute inset-y-0 end-0 top-0 flex items-center pe-3.5 pointer-events-none">
              <ClockIcon />
            </div>
            <input
              type="time"
              className="bg-neutral-50 border leading-none border-neutral-300 text-neutral-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-neutral-700 dark:border-neutral-600 dark:placeholder-neutral-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
              {...(sharedInputProps as React.ComponentProps<"input">)}
            />
          </div>
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
      case "range": {
        return (
          // @ts-ignore
          <SliderWithValueLabel
            {...(sharedInputProps as React.ComponentProps<"input">)}
          />
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

      case "search": {
        if (preview) {
          return <ReferenceSearchPreview />;
        }
        return (
          // @ts-ignore
          <ReferenceSearch
            {...(sharedInputProps as React.ComponentProps<"input">)}
            field_id={id ?? ""}
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
    if (preview) {
      // TODO: improve me
      return <p>hidden field - {name}</p>;
    }

    return <input type="hidden" name={name} defaultValue={defaultValue} />;
  }

  if (type === "payment") {
    return <PaymentField data={data as PaymentFieldData} disabled={disabled} />;
  }

  const LabelText = ({ htmlFor = name }: { htmlFor?: string }) => (
    <Label
      htmlFor={htmlFor}
      data-capitalize={labelCapitalize}
      className="data-[capitalize]:capitalize mb-2"
    >
      {label || name}{" "}
      {required && requiredAsterisk && (
        <span className="text-red-500/80">*</span>
      )}
    </Label>
  );

  const HelpText = () =>
    helpText ? (
      <span className="text-sm text-neutral-400 dark:text-neutral-600">
        {helpText}
      </span>
    ) : (
      <></>
    );

  // custom layout
  switch (type) {
    // this can only present on ai generated data.
    // @ts-ignore
    case "submit": {
      return <></>;
    }
    case "switch": {
      return (
        <label
          data-field-type={type}
          className="flex flex-row gap-1 justify-between items-center"
        >
          <div className="flex flex-col gap-2">
            <LabelText />
            <HelpText />
          </div>
          {renderInput()}
        </label>
      );
    }
    case "checkbox": {
      return (
        <div className="items-top flex space-x-2">
          {renderInput()}
          <div className="grid gap-1.5 leading-none">
            <LabelText />
            <HelpText />
          </div>
        </div>
      );
    }
    case "checkboxes": {
      const renderItem = (item: Option) => {
        return (
          <label className="flex items-center ps-3">
            {/* @ts-ignore */}
            <Checkbox
              name={name}
              id={item.id}
              value={item.value}
              // TODO: this is fine with formData, but has a problem with onChange / onValueChange
              onCheckedChange={__noop}
              {...(sharedInputProps as React.ComponentProps<"input">)}
            />
            <span className="w-full py-3 ms-2 text-sm font-medium text-neutral-900 dark:text-neutral-300">
              {item.label}
              {item.src && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.src}
                  alt={item.label || item.value}
                  className="mt-1 w-12 h-12 aspect-square rounded-sm"
                />
              )}
            </span>
          </label>
        );
      };

      return (
        <div data-field-type={type} className="flex flex-col gap-1">
          <LabelText htmlFor="none" />
          <HelpText />
          <Card>
            <fieldset className="not-prose">
              <ul>
                {options?.map((option) => (
                  <li
                    key={option.value}
                    className="w-full border-b rounded-t-lg"
                  >
                    {renderItem(option)}
                  </li>
                ))}
              </ul>
            </fieldset>
          </Card>
        </div>
      );
    }
    case "radio": {
      return (
        <div data-field-type={type} className="flex flex-col gap-1">
          <LabelText htmlFor="none" />
          {renderInput()}
          <HelpText />
        </div>
      );
    }
    case "toggle-group": {
      if (options) {
        return (
          // @ts-ignore
          <ToggleGroup
            type={multiple ? "multiple" : "single"}
            // TODO: this can be array
            onValueChange={onValueChange}
          >
            {options.map((option) => (
              <ToggleGroupItem key={option.id} value={option.id}>
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        );
      }
    }
  }

  return (
    <div data-field-type={type} className="grid gap-2">
      <LabelText />
      {renderInput()}
      <HelpText />
    </div>
  );
}

interface OnValueChange {
  onValueChange?: (value: string) => void;
  onCheckedChange?: (checked: boolean) => void;
}

/**
 * This is for Select component to automatically de-select the selected item when the selected option is disabled.
 */
function SelectWithSafeValue({
  options: _options,
  locked,
  onValueChange: cb_onValueChange,
  ...inputProps
}: React.ComponentProps<"select"> & {
  placeholder?: string;
  options?: Option[];
} & {
  locked?: boolean;
} & OnValueChange) {
  const {
    value: _value,
    defaultValue: _defaultValue,
    placeholder,
  } = inputProps;

  const { value, defaultValue, options, setValue } = useSafeSelectValue<Option>(
    {
      value: _value as string,
      options: _options?.map((option) => ({
        ...option,
        // map value to id if id exists
        value: option.id || option.value,
        label: option.label || option.value,
      })),
      // TODO: this should be true to display placeholder when changed to disabled, but this won't work for reason.
      // leaving it as false for now.
      useUndefined: false,
      // TODO: also, for smae reason setting the default value to ''
      defaultValue: (_defaultValue || "") as string,
      locked,
    }
  );

  const onValueChange = (value: string) => {
    cb_onValueChange?.(value);
    setValue(value);
  };

  return (
    // shadcn select
    // @ts-ignore
    <Select
      {...(inputProps as React.ComponentProps<"select">)}
      // !!this is required, otherwise, the real native select won't change and fail to validate accurately
      /*!!*/ key={value} /*!!*/
      value={value || undefined}
      // TODO: same reason, disabling defaultValue to display placeholder
      defaultValue={(defaultValue || undefined) as string}
      onValueChange={onValueChange}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options?.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled || false}
          >
            {option.src ? (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={option.src}
                  alt={option.label || option.value}
                  className="w-6 h-6 aspect-square rounded-sm mr-2"
                />
                {option.label || option.value}
              </div>
            ) : (
              <>{option.label || option.value}</>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * This is for Select component to automatically de-select the selected item when the selected option is disabled.
 */
function HtmlSelectWithSafeValue({
  options: _options,
  locked,
  onValueChange: cb_onValueChange,
  ...inputProps
}: React.ComponentProps<"select"> & {
  placeholder?: string;
  options?: {
    id?: string;
    label?: string | null;
    value: string;
    disabled?: boolean | null;
  }[];
} & {
  locked?: boolean;
} & OnValueChange) {
  const {
    value: _value,
    defaultValue: _defaultValue,
    placeholder,
    required,
  } = inputProps;

  const { value, defaultValue, setValue, options } = useSafeSelectValue({
    value: _value as string,
    defaultValue: _defaultValue as string,
    options: _options?.map((option) => ({
      // map value to id if id exists
      value: option.id || option.value,
      label: option.label || option.value,
      disabled: option.disabled,
    })),
    locked,
  });

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setValue(e.target.value);
    cb_onValueChange?.(e.target.value);
  };

  // html5 vanilla select
  return (
    <HtmlSelect
      {...(inputProps as React.ComponentProps<"select">)}
      value={value || undefined}
      defaultValue={defaultValue || ""}
      onChange={onChange}
    >
      {placeholder && (
        <option value="" disabled={!locked && required}>
          {placeholder}
        </option>
      )}
      {options?.map((option) => (
        <option
          key={option.value}
          value={option.value}
          disabled={option.disabled || false}
        >
          {option.label}
        </option>
      ))}
    </HtmlSelect>
  );
}

function HtmlTextarea({
  onValueChange,
  ...props
}: React.ComponentProps<"textarea"> & OnValueChange) {
  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onValueChange?.(e.target.value);
    props.onChange?.(e);
  };

  return (
    <textarea
      className={clsx(
        "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        cls_input_ios_zoom_disable
      )}
      {...props}
      onChange={onChange}
    />
  );
}

function HtmlInput({
  onValueChange,
  ...props
}: React.ComponentProps<"input"> & OnValueChange) {
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onValueChange?.(e.target.value);
    props.onChange?.(e);
  };

  return (
    <input
      className={clsx(
        "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        cls_input_ios_zoom_disable
      )}
      {...props}
      onChange={onChange}
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

function SliderWithValueLabel(
  props: Omit<React.ComponentProps<typeof Slider>, "onValueChange">
) {
  const [value, setValue] = useState(props.value);

  const onValueChange = (value: number[]) => {
    setValue(value);
  };

  return (
    <div className="relative">
      <Slider {...props} onValueChange={onValueChange} />
      <div className="absolute end-0 bottom-2">
        {value && (
          <span className="text-sm text-muted-foreground">
            {value?.[0]}/{props.max ?? 100}
          </span>
        )}
      </div>
    </div>
  );
}

export default FormField;

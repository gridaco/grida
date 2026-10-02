import type { tokens } from "@grida/tokens";

type UUID = string;

export type FormMethod = "get" | "post" | "dialog";

export type FormsPageLanguage =
  | "en"
  | "es"
  | "de"
  | "ja"
  | "fr"
  | "pt"
  | "it"
  | "ko"
  | "ru"
  | "zh"
  | "ar"
  | "hi"
  | "nl";

export type FormResponseUnknownFieldHandlingStrategyType =
  | "accept"
  | "ignore"
  | "reject";

export type FormInputType =
  | "text"
  | "textarea"
  | "richtext"
  | "tel"
  | "url"
  | "checkbox"
  | "checkboxes"
  | "switch"
  | "toggle"
  | "toggle-group"
  | "radio"
  | "number"
  | "date"
  | "datetime-local"
  | "month"
  | "week"
  | "time"
  | "email"
  | "challenge_email"
  | "file"
  | "image"
  | "audio"
  | "video"
  | "select"
  | "latlng"
  | "password"
  | "color"
  | "country"
  | "payment"
  | "hidden"
  | "signature"
  | "range"
  | "search"
  | "json"
  | "canvas";

export type FormFieldAutocompleteType =
  | "off"
  | "on"
  | "name"
  | "honorific-prefix"
  | "given-name"
  | "additional-name"
  | "family-name"
  | "honorific-suffix"
  | "nickname"
  | "email"
  | "username"
  | "new-password"
  | "current-password"
  | "one-time-code"
  | "organization-title"
  | "organization"
  | "street-address"
  | "shipping"
  | "billing"
  | "address-line1"
  | "address-line2"
  | "address-line3"
  | "address-level4"
  | "address-level3"
  | "address-level2"
  | "address-level1"
  | "country"
  | "country-name"
  | "postal-code"
  | "cc-name"
  | "cc-given-name"
  | "cc-additional-name"
  | "cc-family-name"
  | "cc-number"
  | "cc-exp"
  | "cc-exp-month"
  | "cc-exp-year"
  | "cc-csc"
  | "cc-type"
  | "transaction-currency"
  | "transaction-amount"
  | "language"
  | "bday"
  | "bday-day"
  | "bday-month"
  | "bday-year"
  | "sex"
  | "tel"
  | "tel-country-code"
  | "tel-national"
  | "tel-area-code"
  | "tel-local"
  | "tel-extension"
  | "impp"
  | "url"
  | "photo"
  | "webauthn";

export type FormFieldInit = {
  id?: string;
  name: string;
  label: string;
  type: FormInputType;
  placeholder: string;
  required: boolean;
  readonly: boolean;
  help_text: string;
  pattern?: string;
  step?: number;
  min?: number;
  max?: number;
  options?: Option[];
  optgroups?: Optgroup[];
  autocomplete?: FormFieldAutocompleteType[] | null;
  data?: FormFieldDataSchema | null;
  accept?: string | null;
  multiple?: boolean;
  storage?: FormFieldStorageSchema | {} | null;
  reference?: FormFieldReferenceSchema | {} | null;
  v_value?: tokens.TValueExpression | {} | null;
  // options_inventory?: { [option_id: string]: MutableInventoryStock };
};

export interface IFormField {
  name: string;
  label?: string | null;
  type: FormInputType;
  is_array?: boolean;
  placeholder?: string | null;
  required: boolean;
  readonly: boolean;
  help_text?: string | null;
  // oxlint-disable-next-line no-explicit-any -- DB Json type; narrowing requires updating all Supabase query consumers
  pattern?: any;
  step?: number | null;
  min?: number | null;
  max?: number | null;
  options?: Option[];
  optgroups?: Optgroup[];
  autocomplete?: FormFieldAutocompleteType[] | null;
  data?: FormFieldDataSchema | null;
  accept?: string | null;
  multiple?: boolean | null;
  storage?: FormFieldStorageSchema | {} | null;
  reference?: FormFieldReferenceSchema | {} | null;
  v_value?: tokens.TValueExpression | {} | null;
}

export interface FormFieldDefinition extends IFormField {
  id: UUID;
  local_index: number;
}

export type AttributeDefinition = FormFieldDefinition;

export interface IFormBlock<T = FormBlockType> {
  form_field_id?: string | null;
  type: T;
  title_html?: string | null;
  description_html?: string | null;
  body_html?: string | null;
  src?: string | null;
  // oxlint-disable-next-line no-explicit-any -- polymorphic DB JSON; narrowing cascades across 30+ consumers
  data: any;
  parent_id?: string | null;
  local_index: number;
  v_hidden?: tokens.BooleanValueExpression | null;
}

export interface FormBlock<T = FormBlockType> extends IFormBlock<T> {
  id: string;
  form_id: string;
  form_page_id: string | null;
  created_at: string;
}

export type Option = {
  id: string;
  label?: string;
  value: string;
  src?: string | null;
  disabled?: boolean | null;
  index?: number;
  optgroup_id?: string | null;
};

export type Optgroup = {
  id: string;
  label?: string;
  disabled?: boolean | null;
  index?: number;
};

export type FormBlockType =
  | "section"
  | "field"
  | "image"
  | "video"
  | "html"
  | "divider"
  | "header"
  | "pdf"
  // not supported yet
  | "group";

export interface PhoneFieldData {
  /**
   * Defaults the phone input's country selection (E.164 prefix).
   *
   * Stored in `grida_forms.attribute.data` with snake_case naming.
   */
  default_country?: string;
}

export type FormFieldDataSchema = PaymentFieldData | PhoneFieldData | {};

export type FormFieldStorageSchema =
  | XGridaStorageSchema
  | XS3StorageSchema
  | XSupabaseStorageSchema;

export interface FormFieldReferenceSchema {
  type: "x-supabase";
  schema: string;
  table: string;
  column: string;
}

export function isReferenceSchema(
  ref: unknown
): ref is FormFieldReferenceSchema {
  return (
    typeof ref === "object" &&
    ref !== null &&
    "type" in ref &&
    "schema" in ref &&
    "table" in ref &&
    "column" in ref
  );
}

export type PaymentsServiceProviders = "stripe" | "tosspayments";

export interface PaymentFieldData {
  type: "payment";
  service_provider: PaymentsServiceProviders;
}

export interface XS3StorageSchema {
  type: "x-s3";
  bucket: string;
  path: string;
  mode: "direct" | "staged";
}

export interface XSupabaseStorageSchema {
  type: "x-supabase";
  bucket: string;
  path: string;
  mode: "direct" | "staged";
}

export interface XGridaStorageSchema {
  type: "grida";
  bucket: string;
  path: string;
  mode: "direct" | "staged";
}

export interface PageThemeEmbeddedBackgroundData {
  type: "background";
  element: "iframe" | "img" | "div";
  /**
   * allowed for iframe, img
   */
  src?: string;
  /**
   * allowed for all
   */
  "scenes/change/background-color"?: string;
}

export type TemplatePageBackgroundSchema = PageThemeEmbeddedBackgroundData;

export type FontFamily = "inter" | "lora" | "inconsolata";

export type Appearance = "light" | "dark" | "system";

export type FormPageBackgroundSchema = PageThemeEmbeddedBackgroundData;

export type FormStyleSheetV1Schema = {
  section?: string;
  "font-family"?: FontFamily;
  palette?: FormPaletteName;
  appearance?: Appearance;
  custom?: string;
};

export type EndingPageTemplateID = "default" | "receipt01";

export interface EndingPageI18nOverrides {
  $schema: "https://forms.grida.co/schemas/v1/endingpage.json";
  template_id: EndingPageTemplateID;
  overrides: Record<string, string>;
}

export interface CampaignMeta {
  max_form_responses_by_customer: number | null;
  is_max_form_responses_by_customer_enabled: boolean;
  max_form_responses_in_total: number | null;
  is_max_form_responses_in_total_enabled: boolean;
  is_force_closed: boolean;
  is_scheduling_enabled: boolean;
  scheduling_open_at: string | null;
  scheduling_close_at: string | null;
  scheduling_tz?: string;
}

export interface Geo {
  city?: string | undefined;
  country?: string | undefined;
  region?: string | undefined;
  latitude?: string | undefined;
  longitude?: string | undefined;
}

export const formPaletteNames = [
  "blue",
  "gray",
  "green",
  "neutral",
  "orange",
  "red",
  "rose",
  "slate",
  "stone",
  "violet",
  "yellow",
  "zinc",
  "highcontrast_blue",
  "highcontrast_green",
  "highcontrast_orange",
  "highcontrast_red",
  "highcontrast_violet",
  "highcontrast_yellow",
  "saturation_blue",
  "saturation_green",
  "saturation_orange",
  "saturation_red",
  "saturation_violet",
  "saturation_yellow",
  "ryu_001_monochrome",
  "ryu_002_soft_nuetrals",
  "ryu_003_lemon_blue",
  "ryu_004_mint_chocolate",
  "ryu_005_dark_lavender",
  "ryu_006_sage_blush",
  "ryu_007_midnight_blue",
  "ryu_008_blue_steel",
  "ryu_009_neon_yellow",
  "ryu_010_cherry_blossom",
  "ryu_011_peach_sorbet",
  "ryu_012_cotton_candy",
  "ryu_013_soft_violet",
] as const;
export type FormPaletteName = (typeof formPaletteNames)[number];

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };
export type JSONValue = JsonValue;

/** Published start-page JSON; authoring-specific Canvas types stay in the editor. */
export type FormStartPageSchema = {
  template_id: string;
  [key: string]: unknown;
};

import React from "react";
import type { Action } from "./action";
import type { PreferenceState } from "./state";

export type Dispatcher = (action: Action) => void;

export type PreferenceRouteInfo<T extends string = string> = {
  route: T;
  name: string;
  icon?: string;
};

export interface PreferencePageProps {
  state: PreferenceState;
  dispatch: Dispatcher;
}

export interface PreferencePage {
  route: string;
  component: React.FC<PreferencePageProps>;
}

/**
 * A nested Partial<T> type.
 * reference: https://grrr.tech/posts/2021/typescript-partial/
 */
export type Subset<K> = {
  [attr in keyof K]?: K[attr] extends object
    ? Subset<K[attr]>
    : K[attr] extends object | null
    ? Subset<K[attr]> | null
    : K[attr] extends object | null | undefined
    ? Subset<K[attr]> | null | undefined
    : K[attr];
};

type TPropertyBase<T> = {
  default: T;
  /**
   * plain text description. if markdownDescription is defined, this can still be used as a fallback.
   */
  description: string;
  /**
   * markdown description. if this is defined, description will be ignored. if markdown is invalid or failed to parse, this will be ignored.
   */
  markdownDescription?: string;

  tags?: string[];
};

export type TBooleanProperty = TPropertyBase<boolean> & {
  type: "boolean";
};

export type TStringProperty = TPropertyBase<string> & {
  type: "string";
  /**
   * ignored when `enum` is defined
   */
  pattern?: string;
  /**
   * ignored when `enum` is defined
   */
  minLength?: number;
  /**
   * ignored when `enum` is defined
   */
  maxLength?: number;
  /**
   * if this is defined, the property will be treated as an enum.
   */
  enum?: string[];
  enumDescriptions?: string[];
  markdownEnumDescriptions?: string[];
};

export type TNumberProperty = TPropertyBase<number> & {
  type: "number";
  maximum?: number;
  minimum?: number;
};

/**
 * Property Type.
 * inspired from VSCode's API
 * object and array types are not supported
 * object - example: `editor.tokenColorCustomizations`
 * array - example: `files.exclude`
 */
export type TProperty = TBooleanProperty | TNumberProperty | TStringProperty;

export type TPropertyValueType = string | number | boolean;

/**
 * Preference Type.
 * this defines the single preference item, which can hold multiple properties.
 */
export type Preference = {
  identifier: string;
  title: string;
  properties: {
    [key: string]: TProperty;
  };
};

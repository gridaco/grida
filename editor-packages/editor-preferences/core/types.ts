import React from "react";
import type { Action } from "./action";
import type { PreferenceState } from "./state";

export type Dispatcher = (action: Action) => void;

export type PreferenceRouteInfo = {
  route: string;
  name: string;
  hidden?: boolean;
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

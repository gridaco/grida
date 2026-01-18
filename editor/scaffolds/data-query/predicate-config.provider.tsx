"use client";

import type { Data } from "@/lib/data";
import React, { createContext, useContext } from "react";

export type ColorTintedItem = {
  value: string;
  color: string;
};

export type PredicateEnumOptions = string[] | ColorTintedItem[];

export type PredicateConfig = {
  /**
   * Provide a finite option set for a column. Intended for cases like `text[]`
   * where the value should be chosen from known values.
   *
   * Returning `undefined` means \"no enum/options\" for this column.
   */
  getEnumOptions?: (
    meta: Data.Relation.Attribute
  ) => PredicateEnumOptions | undefined;

  /**
   * Provide default predicate settings when adding a predicate for a column.
   * Returning `undefined` means \"use built-in defaults\".
   */
  getDefaultPredicate?: (
    meta: Data.Relation.Attribute
  ) => Partial<Data.Query.Predicate.ExtendedPredicate> | undefined;
};

const PredicateConfigContext = createContext<PredicateConfig | null>(null);

export function PredicateConfigProvider({
  config,
  children,
}: React.PropsWithChildren<{ config: PredicateConfig | null }>) {
  return (
    <PredicateConfigContext.Provider value={config}>
      {children}
    </PredicateConfigContext.Provider>
  );
}

/**
 * Optional config hook. Returns `null` when no provider is present.
 */
export function usePredicateConfig() {
  return useContext(PredicateConfigContext);
}

// Utility types

import type { tokens } from "./tokens";

/**
 * Utility type to create a new type from `T` where:
 * - Properties specified in the keys `K` retain their original types from `T`.
 * - All other properties are replaced with the `tokens.Token` type.
 *
 * This is useful for scenarios where certain properties in an object should remain fixed,
 * while others can be dynamic or "tokenizable."
 *
 * @template T - The base object type.
 * @template K - The keys in `T` that should retain their original types.
 *
 * @example
 * // Example 1: Basic Usage
 * type Original = {
 *   type: "static";
 *   value: number;
 *   description: string;
 * };
 *
 * type Tokenized = TokenizableExcept<Original, "type">;
 * // Resulting type:
 * // {
 * //   type: "static";        // Retained original type
 * //   value: tokens.Token;   // Tokenized
 * //   description: tokens.Token; // Tokenized
 * // }
 *
 * @example
 * // Example 2: Union Types
 * type UnionType =
 *   | { kind: "a"; data: string }
 *   | { kind: "b"; data: number };
 *
 * type TokenizedUnion = TokenizableExcept<UnionType, "kind">;
 * // Resulting type:
 * // {
 * //   kind: "a"; // Retained
 * //   data: tokens.Token; // Tokenized
 * // } | {
 * //   kind: "b"; // Retained
 * //   data: tokens.Token; // Tokenized
 * // }
 *
 * @note
 * This utility only operates at the top level. It does not recursively tokenize nested properties.
 */
export type TokenizableExcept<T extends object, K extends keyof T> = {
  [P in keyof T]: P extends K ? T[P] : tokens.Token;
};

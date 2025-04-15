"use client";
import { grida } from "@/grida";
import { produce } from "immer";
import {
  DependencyList,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import { flatten, unflatten } from "flat";

/**
 * Sets a value on an object using a dot-notation path.
 *
 * @param obj - The target object to modify.
 * @param path - Dot-separated string representing the nested path (e.g., "a.b.c").
 * @param value - The value to set at the specified path.
 *
 * @example
 * const obj = {};
 * setByPath(obj, "foo.bar.baz", 42);
 * console.log(obj); // { foo: { bar: { baz: 42 } } }
 */
function setByPath(obj: any, path: string, value: unknown) {
  const keys = path.split(".");
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (
      !(k in current) ||
      typeof current[k] !== "object" ||
      current[k] === null
    ) {
      current[k] = {};
    }
    current = current[k];
  }

  current[keys[keys.length - 1]] = value;
}

/**
 * Retrieves a value from an object using a dot-notation path.
 *
 * @param obj - The target object to read from.
 * @param path - Dot-separated string representing the nested path (e.g., "a.b.c").
 * @returns The value at the specified path, or undefined if not found.
 *
 * @example
 * const obj = { foo: { bar: { baz: 42 } } };
 * const value = getByPath(obj, "foo.bar.baz");
 * console.log(value); // 42
 */
function getByPath(obj: any, path: string): any {
  return path.split(".").reduce((acc, part) => acc?.[part], obj);
}

function mergeDefaultProps(
  props: Record<string, unknown>,
  properties?: Record<string, grida.program.schema.PropertyDefinition>
) {
  if (!properties) return props;
  const merged: Record<string, unknown> = {};
  Object.entries(properties).forEach(([key, property]) => {
    merged[key] = key in props ? props[key] : property.default;
  });
  return merged;
}

export interface TemplateEditorInstance {
  /**
   * the current props of the template
   */
  props: Record<string, unknown>;

  /**
   * set the props of the template
   */
  set: (key: string, value: unknown) => void;

  /**
   * the merged default props of the template
   */
  mergedDefaultProps: Record<string, unknown>;
}

export interface UseTemplateEditorArgs<
  T extends Record<string, grida.program.schema.PropertyDefinition>,
> {
  /**
   * the schema of the template
   */
  schema?: {
    properties: T;
  };

  /**
   * the initial props of the template
   */
  initialProps: grida.program.schema.TInferredPropTypes<T>;

  /**
   * trigger the onChange event of the template
   */
  onChange?: (props: Record<string, unknown>) => void;
}

interface State {
  schema?: {
    properties: Record<string, grida.program.schema.PropertyDefinition>;
  };
  props: Record<string, unknown>;
}

type Action = { type: "set"; key: string; value: unknown };

function reducer(state: State, action: Action): State {
  return produce(state, (draft) => {
    switch (action.type) {
      case "set":
        const { key, value } = action;
        setByPath(draft.props, key, value);
        break;
      default:
        return state;
    }
  });
}

export function usePropsEditor<T extends Record<string, any>>(
  { schema, initialProps, onChange }: UseTemplateEditorArgs<T>,
  deps: DependencyList = []
): TemplateEditorInstance {
  const [state, dispatch] = useReducer(reducer, {
    schema,
    props: initialProps,
  });

  useEffect(() => {
    onChange?.(state.props);
  }, [state.props]);

  const set = useCallback(
    (key: string, value: unknown) => {
      dispatch({ type: "set", key, value });
    },
    [dispatch]
  );

  const mergedDefaultProps = useMemo(
    () => mergeDefaultProps(state.props, schema?.properties),
    [state.props, schema?.properties]
  );

  return useMemo(
    () => ({
      props: state.props,
      mergedDefaultProps,
      set,
    }),
    [state, dispatch, ...deps]
  );
}

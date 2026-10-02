export { render } from "@grida/forms/templating";
import type { TemplateVariables } from "@grida/forms/templating";
import type { ObjectPath } from "./@types";
import { z } from "zod/v3";
import type { i18n } from "i18next";
import type { Translation } from "@/i18n/resources";

export function getRenderedTexts({
  shape,
  overrides,
  config,
}: {
  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- Zod shape type requires any
  shape: z.ZodObject<any>["shape"];
  overrides: Record<string, string> | null | undefined;
  config: {
    context: TemplateVariables.FormResponseContext;
    i18n: {
      t: i18n["t"];
      basePath?: ObjectPath<Translation> | (() => ObjectPath<Translation>);
    };
    renderer: (
      source: string,
      context: TemplateVariables.FormResponseContext
    ) => string;
    merge?: boolean;
  };
}): Record<string, string> {
  const translate = (key: string) => {
    if (config.i18n.basePath) {
      const path =
        typeof config.i18n.basePath === "function"
          ? config.i18n.basePath()
          : config.i18n.basePath;

      // oxlint-disable-next-line typescript-eslint/no-explicit-any -- i18next t() expects loosely typed interpolation values
      return config.i18n.t(`${path}.${key}`, config.context as any);
    }
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- i18next t() expects loosely typed interpolation values
    return config.i18n.t(key, config.context as any);
  };

  if (overrides) {
    return Object.keys(shape).reduce(
      (acc: Record<string, string>, key: string) => {
        const source = overrides[key];
        if (!source) {
          if (config.merge) {
            return {
              ...acc,
              [key]: translate(key),
            };
          }
          return acc;
        }

        return {
          ...acc,
          [key]: config.renderer(source, config.context),
        };
      },
      {}
    );
  }

  return Object.keys(shape).reduce(
    (acc: Record<string, string>, key: string) => {
      return {
        ...acc,
        [key]: translate(key),
      };
    },
    {}
  );
}

export function getPropTypes(t: Record<string, string>) {
  return z.object(
    Object.keys(t).reduce((acc, key) => {
      return {
        ...acc,
        [key]: z.string().default(t[key]),
      };
    }, {})
  );
}

export function getDefaultTexts(
  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- Zod shape type requires any
  shape: z.ZodObject<any>["shape"],
  defaultTexts?: Record<string, string>
) {
  const defaults = Object.keys(shape).reduce(
    (acc: Record<string, string>, key) => {
      return {
        ...acc,
        [key]:
          defaultTexts?.[key] ??
          shape[key as keyof typeof shape]._def.defaultValue(),
      };
    },
    {}
  );

  return defaults;
}

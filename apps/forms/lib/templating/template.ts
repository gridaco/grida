import Handlebars from "handlebars";
import { ObjectPath } from "./@types";
import { z } from "zod";
import type { TemplateVariables } from ".";
import type { i18n } from "i18next";
import type { Translation } from "@/i18n/resources";

export function render(
  source: string,
  context: TemplateVariables.FormResponseContext
) {
  return Handlebars.compile(source)(context);
}

export function getRenderedTexts({
  shape,
  overrides,
  config,
}: {
  shape: z.ZodObject<any>["shape"];
  overrides: Record<string, string> | null | undefined;
  config: {
    context: TemplateVariables.FormResponseContext;
    i18n: {
      t: i18n["t"];
      basePath?: ObjectPath<Translation> | (() => ObjectPath<Translation>);
    };
    renderer: (source: string, context: any) => string;
    merge?: boolean;
  };
}): Record<string, string> {
  const translate = (key: string) => {
    if (config.i18n.basePath) {
      const path =
        typeof config.i18n.basePath === "function"
          ? config.i18n.basePath()
          : config.i18n.basePath;

      return config.i18n.t(`${path}.${key}`, config.context as any);
    }
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
  shape: z.ZodObject<any>["shape"],
  defaultTexts?: Record<string, string>
) {
  const defaults = Object.keys(shape).reduce((acc: any, key) => {
    return {
      ...acc,
      [key]:
        defaultTexts?.[key] ??
        shape[key as keyof typeof shape]._def.defaultValue(),
    };
  }, {});

  return defaults;
}

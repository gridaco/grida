import type { ZodSchema } from "zod";
import React from "react";
import { TemplateComponents } from "@/builder/template-builder";

const TEMPLATE_SCHEMA_KEY = "schema";
const TEMPLATE_TYPE_KEY = "type";

export type ZTemplateSchema<P> = ZodSchema<{ properties: P }>;

export type FinalProps<P> = P & {
  properties: P;
  style?: React.CSSProperties;
};

export type TemplateComponent<P = any> = React.FC<FinalProps<P>> & {
  [TEMPLATE_SCHEMA_KEY]?: ZTemplateSchema<P>;
  [TEMPLATE_TYPE_KEY]?: string;
};

export function withTemplate<P>(
  Component: TemplateComponent<P>,
  type: string,
  schema?: ZTemplateSchema<P>
): TemplateComponent<P> {
  const WrappedComponent: React.FC<FinalProps<P>> = (props: FinalProps<P>) => {
    // Validate props against zod schema (uncomment if needed)
    // const result = schema.safeParse(props);
    // if (!result.success) {
    //   throw new Error(
    //     `Invalid props for component type "${type}": ${result.error.message}`
    //   );
    // }

    return <Component {...props} __type={type} />;
  };

  WrappedComponent.displayName = `withTemplate(${Component.displayName || Component.name || "Component"})`;
  // @ts-ignore
  WrappedComponent[TEMPLATE_SCHEMA_KEY] = schema;
  // @ts-ignore
  WrappedComponent[TEMPLATE_TYPE_KEY] = type;

  TemplateComponents.registerComponent(WrappedComponent);

  return WrappedComponent as TemplateComponent<P>;
}

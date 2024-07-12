import type { ZodSchema } from "zod";
import React from "react";

const TEMPLATE_SCHEMA_KEY = "schema";
const TEMPLATE_TYPE_KEY = "type";

export type ZTemplateSchema<P> = ZodSchema<{ props: P }>;

export type TemplateComponent<P = any> = React.FC<P> & {
  [TEMPLATE_SCHEMA_KEY]?: ZTemplateSchema<P>;
  [TEMPLATE_TYPE_KEY]?: string;
};

export function withTemplate<P>(
  Component: TemplateComponent<P>,
  type: string,
  schema: ZTemplateSchema<P>
): TemplateComponent<P> {
  const WrappedComponent: React.FC<P> = (props: P) => {
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

  return WrappedComponent as TemplateComponent<P>;
}

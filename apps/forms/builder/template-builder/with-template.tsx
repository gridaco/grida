import React from "react";
import { TemplateComponents } from "@/builder/template-builder";
import { grida } from "@/grida";

const TEMPLATE_TYPE_KEY = "type";
const TEMPLATE_PROPERTIES_KEY = "properties";

export type TemplateValueProperties<P extends Record<string, any>, T> = {
  [K in keyof P]: P[K] | T;
};

export type TemplateComponent = React.FC<any> & {
  [TEMPLATE_TYPE_KEY]: string;
  [TEMPLATE_PROPERTIES_KEY]: grida.program.schema.Properties;
};

export function withTemplateDefinition<P>(
  Component: React.FC<P>,
  type: string,
  properties: grida.program.schema.Properties
): TemplateComponent {
  const WrappedComponent: React.FC<P> = (props: P) => {
    return <Component {...props} data-grida-widget-type={type} />;
  };

  WrappedComponent.displayName = `withTemplate(${Component.displayName || Component.name || "Component"})`;
  (WrappedComponent as any)[TEMPLATE_PROPERTIES_KEY] = properties;
  (WrappedComponent as any)[TEMPLATE_TYPE_KEY] = type;

  TemplateComponents.registerComponent(WrappedComponent as TemplateComponent);

  return WrappedComponent as TemplateComponent;
}

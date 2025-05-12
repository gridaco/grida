import React from "react";
import { TemplateComponents } from "@/grida-react-canvas/template-builder";
import grida from "@grida/schema";

const TEMPLATE_TYPE_KEY = "type";
const TEMPLATE_DEFINITION_KEY = "definition";

export type TemplateValueProperties<P extends Record<string, any>, T> = {
  [K in keyof P]: P[K] | T;
};

export type TemplateComponent = React.FC<any> & {
  [TEMPLATE_TYPE_KEY]: string;
  [TEMPLATE_DEFINITION_KEY]: grida.program.schema.Properties;
};

export function withTemplateDefinition<P>(
  Component: React.FC<P>,
  type: string,
  definition: grida.program.document.template.TemplateDocumentDefinition
): TemplateComponent {
  const WrappedComponent: React.FC<P> = (props: P) => {
    return <Component {...props} data-grida-widget-type={type} />;
  };

  WrappedComponent.displayName = `withTemplate(${Component.displayName || Component.name || "Component"})`;
  (WrappedComponent as any)[TEMPLATE_DEFINITION_KEY] = definition;
  (WrappedComponent as any)[TEMPLATE_TYPE_KEY] = type;

  TemplateComponents.registerComponent(WrappedComponent as TemplateComponent);

  return WrappedComponent as TemplateComponent;
}

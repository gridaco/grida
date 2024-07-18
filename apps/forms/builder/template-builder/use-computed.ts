import { useSelectValue, useValue } from "@/builder/core/data-context";
import { TemplateValueProperties } from "./with-template";
import { Tokens, Factory } from "@/ast";

// TODO: needs optimization
export function useComputed<P extends Record<string, any>>(
  properties?: TemplateValueProperties<P, Tokens.StringValueExpression>
): P {
  // list all data keys that are needed for selecting required values
  const datakeys = Object.entries(properties || {})
    .map(([key, value]) => {
      if (Tokens.is.propertyAccessExpression(value)) {
        return [value.expression];
      } else if (Tokens.is.templateExpression(value)) {
        return Factory.getTemplateExpressionDataKeyPaths(value);
      } else {
        return [];
      }
    })
    .flat();

  const contextdata = useSelectValue({
    keys: datakeys,
  });

  const computed = Object.entries(properties || {}).reduce(
    (acc: Record<string, any>, [key, value]) => {
      if (Tokens.is.propertyAccessExpression(value)) {
        acc[key] = Factory.renderPropertyAccessExpression(value, contextdata);
      } else if (Tokens.is.templateExpression(value)) {
        acc[key] = Factory.renderTemplateExpression(value, contextdata);
      } else {
        acc[key] = value;
      }

      return acc;
    },
    {} as P
  );

  // console.log(computed, contextdata, datakeys, properties);

  return computed as P;
}

import { useMemo } from "react";
import { useSelectValue, useValue } from "@/grida/react-runtime/data-context";
import { TemplateValueProperties } from "../template-builder/with-template";
import { Tokens, Factory } from "@/ast";

function extractAccessIdentifiersDependencyArrayFromProps<
  P extends Record<string, any>,
>(props?: TemplateValueProperties<P, Tokens.StringValueExpression>) {
  return Object.entries(props || {})
    .map(([key, value]) => {
      return Factory.getStringValueExpressionAccessIdentifiersDependencyArray(
        value
      );
    })
    .flat();
}

// TODO: needs optimization
export function useComputed<P extends Record<string, any>>(
  props?: TemplateValueProperties<P, Tokens.StringValueExpression>
): P {
  // list all data keys that are needed for selecting required values
  const datakeys = useMemo(
    () => extractAccessIdentifiersDependencyArrayFromProps(props),
    [props]
  );

  const contextdata = useSelectValue({
    keys: datakeys,
  });

  const computed = Object.entries(props || {}).reduce(
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

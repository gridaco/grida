import { useMemo } from "react";
import { useSelectValue, useValue } from "@/program-context/data-context";
import { TemplateValueProperties } from "../template-builder/with-template";
import { tokens } from "@/ast";

function extractAccessIdentifiersDependencyArrayFromProps<
  P extends Record<string, any>,
>(props?: TemplateValueProperties<P, tokens.StringValueExpression>) {
  return Object.entries(props || {})
    .map(([key, value]) => {
      return tokens.factory.getStringValueExpressionAccessIdentifiersDependencyArray(
        value
      );
    })
    .flat();
}

// TODO: needs optimization
export function useComputed<P extends Record<string, any>>(
  props?: TemplateValueProperties<P, tokens.StringValueExpression>
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
      if (tokens.is.propertyAccessExpression(value)) {
        acc[key] = tokens.factory.renderPropertyAccessExpression(
          value,
          contextdata
        );
      } else if (tokens.is.templateExpression(value)) {
        acc[key] = tokens.factory.renderTemplateExpression(value, contextdata);
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

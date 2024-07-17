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
      if (Factory.isTemplateExpression(value)) {
        return Factory.extractTemplateExpressionDataKeyPaths(value);
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
      if (Factory.isTemplateExpression(value)) {
        acc[key] = Factory.renderTemplateExpression(value, contextdata);
      } else {
        acc[key] = value;
      }

      return acc;
    },
    {} as P
  );

  console.log(computed, contextdata, datakeys);

  return computed as P;
}

// const pathvalues = Object.values(defaultProperties || {});

// const pathdata = useSchemaValue({
//   keys: pathvalues, // propertyKeys,
// });

// // map the data back to match the property interface
// const data = Object.keys(defaultProperties || {}).reduce(
//   (acc, key) => {
//     const path = (defaultProperties || {})[key];
//     acc[key] = pathdata[path];
//     return acc;
//   },
//   {} as Record<string, any>
// );

// const props = {
//   text: text || defaultText,
//   properties: {
//     ...defaultProperties,
//     // ...data,
//   },
//   style: {
//     ...defaultStyle,
//     ...style,
//   },
// };

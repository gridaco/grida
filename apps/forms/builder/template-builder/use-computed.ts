import { useSchemaValue, useValue } from "@/builder/core/data-context";
import { ContextValueProperties } from "./with-template";
import { Tokens } from "@/types/ast";

function useComputed<P extends Record<string, any>>(
  properties: ContextValueProperties<P, Tokens.StringValueExpression>
) {
  // 1. get the path literals
  // const
  //
  // const pathvalues = Object.values(properties || {});
  // const pathdata = useSchemaValue({
  //   keys: pathvalues, // propertyKeys,
  // });
  // // // map the data back to match the property interface
  // const data = Object.keys(properties || {}).reduce(
  //   (acc, key) => {
  //     const path = (properties || {})[key];
  //     acc[key] = pathdata[path];
  //     return acc;
  //   },
  //   {} as Record<string, any>
  // );
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

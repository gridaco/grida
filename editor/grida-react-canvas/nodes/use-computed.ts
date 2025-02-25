import { useMemo } from "react";
import {
  useData,
  useSelectValue,
  useValue,
} from "@/program-context/data-context";
import { TemplateValueProperties } from "../template-builder/with-template";
import { tokens } from "@grida/tokens";

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
  props?: TemplateValueProperties<P, tokens.StringValueExpression>,
  recursive: boolean = false
): P {
  // // list all data keys that are needed for selecting required values
  // const datakeys = useMemo(
  //   () => extractAccessIdentifiersDependencyArrayFromProps(props),
  //   [props]
  // );

  // const contextdata = useSelectValue({
  //   keys: datakeys,
  // });

  // const computed = useMemo(() => {
  //   return Object.entries(props || {}).reduce(
  //     (acc: Record<string, any>, [key, value]) => {
  //       acc[key] = tokens.render.any(value, contextdata, recursive);
  //       return acc;
  //     },
  //     {} as P
  //   );
  // }, [props, contextdata, recursive]);

  // console.log("computed", computed, props, datakeys, contextdata);
  const data = useData();

  const computed = useMemo(() => {
    return Object.entries(props || {}).reduce(
      (acc: Record<string, any>, [key, value]) => {
        acc[key] = tokens.render.any(value, data, recursive);
        return acc;
      },
      {} as P
    );
  }, [props, data, recursive]);

  // console.log("computed", computed, props, data);
  return computed as P;
}

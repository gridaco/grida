import { grida } from "@/grida";
import { PropertyLine, PropertyLineLabel } from "../ui";
import { StringValueControl } from "./string-value";
import type { Tokens } from "@/ast";
import { SrcControl } from "./src";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function PropsControl({
  properties,
  props,
  onValueChange,
}: {
  properties: grida.program.schema.Properties;
  props: grida.program.schema.Props;
  onValueChange: (key: string, value: any) => void;
}) {
  return (
    <>
      {Object.keys(properties).map((key) => {
        const def = properties[key];
        const value = props?.[key];

        return (
          <PropertyLine key={key}>
            <PropertyLineLabel>{key}</PropertyLineLabel>
            <PropControl
              placeholder={key}
              property={def}
              value={value}
              onValueChange={(value) => {
                onValueChange(key, value || undefined);
              }}
            />
          </PropertyLine>
        );
      })}
    </>
  );
}

export function PropControl({
  property,
  value,
  placeholder,
  onValueChange,
}: {
  property: grida.program.schema.PropertyDefinition;
  placeholder?: string;
  value: grida.program.schema.Value;
  onValueChange: (value: grida.program.schema.Value | undefined) => void;
}) {
  const { type } = property;
  switch (type) {
    case "string":
      return (
        <StringValueControl
          placeholder={placeholder}
          value={value as Tokens.StringValueExpression}
          onValueChange={onValueChange}
        />
      );
    case "image":
      return (
        <SrcControl value={value as string} onValueChange={onValueChange} />
      );
    default:
      return (
        <Tooltip>
          <TooltipTrigger>
            <StringValueControl
              placeholder={placeholder}
              value={value as Tokens.StringValueExpression}
              disabled
            />
          </TooltipTrigger>
          <TooltipContent>
            {`Unsupported property type: ${type}`}
          </TooltipContent>
        </Tooltip>
      );
  }
}

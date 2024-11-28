import { Tokens } from "@/ast";
import { Factory } from "@/ast/factory";
import { grida } from "@/grida";
import { PropertyEnum } from "../ui";

export function StringValuePropsPropertyAccessExpressionControl({
  schema,
  value,
  onValueChange,
  placeholder,
  disabled,
}: {
  schema: {
    properties: grida.program.schema.Properties;
  };
  value?: Tokens.StringValueExpression | null;
  onValueChange?: (value?: Tokens.StringValueExpression) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  // Note: force cast to `props.` - this behavior may change in the future

  const enums = Object.keys(schema.properties).map((key) => ({
    label: "props." + key,
    value: key,
  }));

  const uivalue = value
    ? // TODO: remove props. token
      Factory.strfy.stringValueExpression(value)
    : undefined;

  const _onValueChange = (key: string) => {
    const exp = Factory.createPropertyAccessExpression(["props", key]);
    onValueChange?.(exp);
  };

  return (
    <PropertyEnum
      value={uivalue}
      onValueChange={_onValueChange}
      placeholder={placeholder}
      enum={enums}
    />
  );
}

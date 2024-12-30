import { tokens } from "@/ast";
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
  value?: tokens.StringValueExpression | null;
  onValueChange?: (value?: tokens.StringValueExpression) => void;
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
      tokens.factory.strfy.stringValueExpression(value)
    : undefined;

  const _onValueChange = (key: string) => {
    const exp = tokens.factory.createPropertyAccessExpression(["props", key]);
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

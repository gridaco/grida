import { tokens } from "@grida/tokens";
import { grida } from "@/grida";
import { PropertyEnum } from "../ui";

export function PropertyAccessExpressionControl({
  schema,
  value,
  onValueChange,
  placeholder,
  disabled,
  propertyType,
}: {
  schema: {
    properties: grida.program.schema.Properties;
  };
  value?: tokens.PropertyAccessExpression | null;
  onValueChange?: (value?: tokens.PropertyAccessExpression) => void;
  propertyType?: grida.program.schema.PropertyDefinitionType;
  placeholder?: string;
  disabled?: boolean;
}) {
  // Note: force cast to `props.` - this behavior may change in the future

  const enums = Object.keys(schema.properties).map((key) => {
    const pd = schema.properties[key];
    return {
      label: "props." + key,
      value: key,
      disabled: pd.type ? pd.type !== propertyType : false,
    };
  });

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
      disabled={disabled}
      value={uivalue}
      onValueChange={_onValueChange}
      placeholder={placeholder}
      enum={enums}
    />
  );
}

import React from "react";
import styled from "@emotion/styled";
import ReactMarkdown from "react-markdown";
import { Checkbox } from "@modulz/design-system";
import type {
  Preference,
  TBooleanProperty,
  TNumberProperty,
  TProperty,
  TPropertyValueType,
  TStringProperty,
} from "../core";

type PropertyValues = {
  [key: string]: TPropertyValueType;
};

export function PreferenceItem({
  identifier,
  title,
  properties,
  values,
  onChange,
}: Preference & {
  values: PropertyValues;
  onChange?: OnPropertyChange;
}) {
  return (
    <PreferenceItemContainer data-preference-id={identifier}>
      <span className="title">{title}</span>
      <div className="properties">
        {Object.keys(properties).map((k) => {
          const property = properties[k];
          const value = values[k];
          const cb = (v) => {
            onChange?.(k, v);
          };
          switch (property.type) {
            case "boolean": {
              return (
                <PreferenceCheckboxItem
                  key={k}
                  {...property}
                  onChange={cb}
                  value={value as boolean}
                />
              );
            }
            case "number": {
              return (
                <PreferenceTextFieldItem
                  key={k}
                  {...property}
                  onChange={cb}
                  value={value as number | string}
                />
              );
            }
            case "string": {
              if (property.enum) {
                return (
                  <PreferenceSelectItem
                    key={k}
                    {...property}
                    onChange={cb}
                    value={value as string}
                  />
                );
              }
              return (
                <PreferenceTextFieldItem
                  key={k}
                  {...property}
                  onChange={cb}
                  value={value as string}
                />
              );
            }
          }
        })}
      </div>
    </PreferenceItemContainer>
  );
}

type TOnChange<T> = (value: T) => void;
type Properties = { [key: string]: TProperty };
type OnPropertyChange = <K extends keyof Properties>(
  key: K,
  value: Properties[K]["default"]
) => void;

function PropertyDescription({
  description,
  markdownDescription,
}: {
  description: string;
  markdownDescription?: string;
}) {
  return (
    <div className="description">
      {markdownDescription ? (
        <ReactMarkdown>{markdownDescription}</ReactMarkdown>
      ) : (
        <span>{description}</span>
      )}
    </div>
  );
}

function PreferenceCheckboxItem({
  value,
  onChange,
  ...props
}: TBooleanProperty & {
  onChange?: TOnChange<boolean>;
  value?: boolean | "indeterminate";
}) {
  return (
    <div className="checkbox">
      <Checkbox
        style={{
          color: "white",
        }}
        // defaultChecked={props.default}
        checked={value}
        onCheckedChange={(checked) => {
          if (typeof checked === "boolean") {
            onChange?.(checked);
          }
        }}
      />
      <PropertyDescription {...props} />
    </div>
  );
}

function PreferenceTextFieldItem({
  ...props
}: (TStringProperty | TNumberProperty) & {
  onChange?: TOnChange<string>;
  value?: string | number;
}) {
  return (
    <>
      <PropertyDescription {...props} />
    </>
  );
}

function PreferenceSelectItem(
  props: TStringProperty & {
    onChange?: TOnChange<string>;
    value?: string;
  }
) {
  return <></>;
}

const PreferenceItemContainer = styled.div`
  /*  */
  cursor: default;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 4px;

  &:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .title {
    color: rgba(255, 255, 255, 0.8);
    font-weight: 500;
  }

  .properties {
    display: flex;
    flex-direction: column;
  }

  .description {
    color: rgba(255, 255, 255, 0.7);
    font-size: 14px;
  }

  .checkbox {
    display: flex;
    flex-direction: row;
    gap: 8px;
    align-items: center;
    justify-content: flex-start;
  }

  transition: background 0.1s ease-in-out;
`;

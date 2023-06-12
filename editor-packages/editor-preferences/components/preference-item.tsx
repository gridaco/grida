import React from "react";
import styled from "@emotion/styled";
import ReactMarkdown from "react-markdown";
import { Checkbox } from "@modulz/design-system";
import type {
  Preference,
  TBooleanProperty,
  TNumberProperty,
  TPropertyValueType,
  TStringProperty,
} from "../core";

export function PreferenceItem({
  identifier,
  title,
  properties,
}: Preference & {
  onChange?: OnPropertyChange;
}) {
  return (
    <PreferenceItemContainer data-preference-id={identifier}>
      <h3>{title}</h3>
      <div className="properties">
        {Object.keys(properties).map((k) => {
          const property = properties[k];
          switch (property.type) {
            case "boolean": {
              return (
                <PreferenceCheckboxItem
                  key={k}
                  {...property}
                  onChange={() => {}}
                />
              );
            }
            case "number": {
              return (
                <PreferenceTextFieldItem
                  key={k}
                  {...property}
                  onChange={() => {}}
                />
              );
            }
            case "string": {
              if (property.enum) {
                return (
                  <PreferenceSelectItem
                    key={k}
                    {...property}
                    onChange={() => {}}
                  />
                );
              }
              return (
                <PreferenceTextFieldItem
                  key={k}
                  {...property}
                  onChange={() => {}}
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
type OnPropertyChange = (identifier: string, value: TPropertyValueType) => void;

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
        <p>{description}</p>
      )}
    </div>
  );
}

function PreferenceCheckboxItem({
  ...props
}: TBooleanProperty & { onChange?: TOnChange<boolean> }) {
  return (
    <div className="checkbox">
      <Checkbox />
      <PropertyDescription {...props} />
    </div>
  );
}

function PreferenceTextFieldItem({
  ...props
}: (TStringProperty | TNumberProperty) & { onChange?: TOnChange<string> }) {
  return (
    <>
      <PropertyDescription {...props} />
    </>
  );
}

function PreferenceSelectItem(
  props: TStringProperty & { onChange?: TOnChange<string> }
) {
  return <></>;
}

const PreferenceItemContainer = styled.div`
  /*  */
  display: flex;

  .properties {
    display: flex;
    flex-direction: column;
  }

  .description {
  }

  .checkbox {
    display: flex;
    flex-direction: row;
    gap: 8px;
    align-items: center;
    justify-content: flex-start;
  }
`;

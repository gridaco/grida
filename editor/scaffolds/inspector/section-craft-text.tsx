import React, { useCallback } from "react";
import {
  PropertyLine,
  PropertyGroup,
  PropertyGroupHeader,
  PropertyInput,
  PropertyLines,
  PropertySelectInput,
  PropertyInputToggleGroup,
  PropertyNumericInput,
} from "@editor-ui/property";
import { useInspectorElement } from "hooks/use-inspector-element";
import { useDispatch } from "core/dispatch";
import {
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
} from "@radix-ui/react-icons";
import { FontWeight } from "@reflect-ui/core";

export function CrafTextSection() {
  const dispatch = useDispatch();
  const element = useInspectorElement();

  const onTextDataChange = useCallback(
    (text: string) => {
      dispatch({
        type: "(craft)/node/text/data",
        data: text,
      });
    },
    [dispatch]
  );

  const onTextAlignChange = useCallback(
    (align: "left" | "center" | "right") => {
      dispatch({
        type: "(craft)/node/text/align",
        align,
      });
    },
    [dispatch]
  );

  const onFontWeightChange = useCallback(
    (weight: FontWeight) => {
      dispatch({
        type: "(craft)/node/text/font/weight",
        weight,
      });
    },
    [dispatch]
  );

  const onFontSizeChange = useCallback(
    (size: number) => {
      dispatch({
        type: "(craft)/node/text/font/size",
        size,
      });
    },
    [dispatch]
  );

  if (!element || !("text" in element)) {
    return <></>;
  }

  const text = element.text;
  const { fontWeight, fontSize, textAlign } = element.style;

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Text</h6>
      </PropertyGroupHeader>
      <PropertyLines>
        <PropertyLine>
          <PropertySelectInput
            options={[
              FontWeight.w100,
              FontWeight.w200,
              FontWeight.w300,
              FontWeight.w400,
              FontWeight.w500,
              FontWeight.w600,
              FontWeight.w700,
              FontWeight.w800,
              FontWeight.w900,
            ]}
            value={cssFontWeightToCore(fontWeight)}
            onChange={onFontWeightChange}
          />
          <PropertyNumericInput
            stopPropagation
            onChange={onFontSizeChange}
            value={fontSize}
          />
        </PropertyLine>
        <PropertyLine label="Align">
          <PropertyInputToggleGroup
            value={textAlign}
            options={[
              {
                value: "left",
                icon: <TextAlignLeftIcon />,
              },
              {
                value: "center",
                icon: <TextAlignCenterIcon />,
              },
              {
                value: "right",
                icon: <TextAlignRightIcon />,
              },
            ]}
            onValueChange={onTextAlignChange}
          />
        </PropertyLine>
        <PropertyLine label="Value">
          <PropertyInput
            value={text}
            stopPropagation
            onChange={(txt) => {
              onTextDataChange(txt);
            }}
          />
        </PropertyLine>
      </PropertyLines>
    </PropertyGroup>
  );
}

function cssFontWeightToCore(fontWeight: React.CSSProperties["fontWeight"]) {
  switch (fontWeight) {
    case "bold":
      return FontWeight.bold;
    case "normal":
      return FontWeight.normal;
    case "lighter":
      return FontWeight.lighter;
    case "bolder":
      return FontWeight.bolder;
    case 100:
      return FontWeight.w100;
    case 200:
      return FontWeight.w200;
    case 300:
      return FontWeight.w300;
    case 400:
      return FontWeight.w400;
    case 500:
      return FontWeight.w500;
    case 600:
      return FontWeight.w600;
    case 700:
      return FontWeight.w700;
    case 800:
      return FontWeight.w800;
    case 900:
      return FontWeight.w900;
    default:
      return FontWeight.normal;
  }
}

import React, { useRef, useEffect, useState } from "react";
import { Flex } from "rebass";
import styled, { CSSObject } from "@emotion/styled";
import { InterpolationWithTheme } from "@emotion/core";
import { ThemeInterface } from "utils/styled/theme";

const variants = [
  "full-width",
  "content-overflow-1",
  "content-default",
  "content-inset-1",
];

interface SectionLayoutProps {
  variant?:
    | "full-width"
    | "content-overflow-1"
    | "content-default"
    | "content-inset-1";
  inherit?: boolean;
  alignContent?: "start" | "center" | "end";
  debug?: boolean;
  debugOption?: {
    debugPostion?: string;
  };
  backgroundColor?: string;
  className?: string;
  notAutoAllocateHeight?: boolean;
}

const SectionLayout: React.FC<SectionLayoutProps> = ({
  variant = "content-default",
  inherit = true,
  alignContent = "start",
  children,
  debug = false,
  backgroundColor = "rgb(0,0,0,0)",
  debugOption,
  className,
  notAutoAllocateHeight = false,
}) => {
  const parentFlexBox = useRef(null);
  const childFlexBox = useRef(null);
  const [isChecked, setIsChecked] = useState(true);

  const getWidthUseVaraint = () => {
    switch (variant) {
      case "full-width":
        return "100%";
      case "content-overflow-1":
        return ["100%", "768px", "1024px", "1280px"];
      case "content-default":
        return ["100%", "728px", "984px", "1040px"];
      case "content-inset-1":
        return ["100%", "664px", "864px", "932px"];
    }
  };

  const getAlignContent = () => {
    switch (alignContent) {
      case "start":
        return "flex-start";
      case "center":
        return "center";
      case "end":
        return "flex-end";
    }
  };

  useEffect(() => {
    childFlexBox.current.style.zIndex = 5;
    if (!inherit && !notAutoAllocateHeight) {
      parentFlexBox.current.style.height =
        childFlexBox.current.clientHeight + "px";
    }
    if (
      variants.includes(parentFlexBox.current.parentElement.classList.item(0))
    ) {
      if (inherit) {
        childFlexBox.current.style.width = "100%";
      } else {
        childFlexBox.current.style.width = "";
      }
    }
  }, [parentFlexBox, childFlexBox, inherit]);

  const getMarginUseVaraint = () => {
    switch (variant) {
      case "full-width":
      case "content-overflow-1":
        return ["0px", "0px", "0px", "0px"];
      case "content-default":
        return ["20px", "20px", "20px", "0px"];
      case "content-inset-1":
        return ["20px", "4%", "4%", "4%"];
    }
  };

  const getAbsoluteStyle = () => {
    let style = {};
    if (!inherit) {
      switch (variant) {
        case "full-width":
          style = {
            position: "absolute",
            left: "0px",
            zIndex: 5,
          };
          break;
        case "content-overflow-1":
          style = {
            position: "absolute",
            transform: "translate(0%, 0px)",
            zIndex: 5,
          };
          break;
        case "content-default":
          style = {
            position: "absolute",
            transform: "translate(44%, 0px)",
            zIndex: 5,
          };
          break;
      }
    }

    return style;
  };

  return (
    <Flex
      className={className || ""}
      width="100%"
      ref={parentFlexBox}
      alignItems="center"
      justifyContent="center"
      height="100%"
    >
      {debug && (
        <Debug>
          <span
            style={{
              transform: `translate(-30px, -${debugOption?.debugPostion}%)`,
            }}
          >
            {" "}
            <input
              type="checkbox"
              onClick={e => setIsChecked(!isChecked)}
              defaultChecked={isChecked}
            />
            {variant}
          </span>
        </Debug>
      )}
      <Flex
        mx={getMarginUseVaraint()}
        ref={childFlexBox}
        className={variant}
        bg={!debug ? backgroundColor : "rgba(83, 245, 255, 0.4)"}
        width={getWidthUseVaraint()}
        flexDirection="column"
        alignItems={getAlignContent()}
        style={getAbsoluteStyle()}
      >
        {children}
      </Flex>
    </Flex>
  );
};

export default SectionLayout;

const Debug = styled.div`
  span {
    position: absolute;

    background-color: red;
    padding: 0px 5px;
    color: #fff;
  }
`;

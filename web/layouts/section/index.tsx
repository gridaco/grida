import React, { useRef, useEffect, useState } from 'react'
import { Flex } from 'rebass';
import styled from '@emotion/styled';

const variants = ["full-width", "content-overflow-1", "content-default", "content-inset-1"]

interface SectionLayoutProps {
  variant?: "full-width" | "content-overflow-1" | "content-default" | "content-inset-1";
  inherit?: boolean
  alignContent?: "start" | "center" | "end"
}

const SectionLayout: React.FC<SectionLayoutProps> = ({ variant = "content-default", inherit = true, alignContent = "start", children }) => {
  const parentFlexBox = useRef(null);
  const childFlexBox = useRef(null);

  const getWidthUseVaraint = () => {
    switch (variant) {
      case "full-width":
        return "100%";
      case "content-overflow-1":
        return ["320px", "768px", "1024px", "1280px"];
      case "content-default":
        return ["284px", "728px", "984px", "1040px"];
      case "content-inset-1":
        return ["280px", "664px", "864px", "932px"];
    }
  }

  const getAlignContent = () => {
    switch (alignContent) {
      case "start":
        return "flex-start";
      case "center":
        return "center";
      case "end":
        return "flex-end";
    }
  }

  useEffect(() => {
    if (!inherit) {
      parentFlexBox.current.style.height = childFlexBox.current.clientHeight + "px"
    }
    if (variants.includes(parentFlexBox.current.parentElement.classList.item(0))) {
      if (inherit) {
        childFlexBox.current.style.width = "100%"
      } else {
        childFlexBox.current.style.width = ""
      }
    }
  }, [parentFlexBox, childFlexBox, inherit])

  const getMarginUseVaraint = () => {
    switch (variant) {
      case "full-width":
      case "content-overflow-1":
        return "0px"
      case "content-default":
        return "20px"
      case "content-inset-1":
        return ["20px", "4%", "4%", "4%"]
    }
  }

  const getAbsoluteStyle = () => {
    let style = {}
    if (!inherit) {
      switch (variant) {
        case "full-width":
          style = {
            position: "absolute", 
            left: "0px" 
          };
          break;
        case "content-overflow-1":
          style = {
            position: "absolute", 
            transform: "translate(40%, 0px)"
          }
          break;
        case "content-default":
          style = { 
            position: "absolute", 
            transform: "translate(44%, 0px)"
          };
          break;
      }
    }

    return style
  }

  return (
    <Flex
      ref={parentFlexBox}
      alignItems="center"
      justifyContent="center"
      height={childFlexBox.current?.clientHeight + "px"}
    >
      <Flex
        mx={getMarginUseVaraint()}
        ref={childFlexBox}
        className={variant}
        bg="rgba(83, 245, 255, 0.4)"
        width={getWidthUseVaraint()}
        flexDirection="column"
        alignItems={getAlignContent()}
        style={getAbsoluteStyle()}
      >
        {children}
      </Flex>
    </Flex>
  )
}

export default SectionLayout

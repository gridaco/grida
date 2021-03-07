import styled from "@emotion/styled";
import { motion, useTransform, useMotionValue } from "framer-motion";
import React, { useState, useEffect, createRef } from "react";
import { Flex, Heading } from "rebass";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";

const GradientRowList = () => {
  const [x, setX] = useState<number>(0);
  const [beforeClick, setBeforeClick] = useState<number>(0);
  const elRefs = React.useRef([]);
  let elWidth = [];
  const contents = ["code", "server", "translations", "insight", "GIT", "everything"];
  const spring = {
    type: "spring",
    stiffness: 700,
    damping: 30,
  };

  useEffect(() => {
    elRefs.current = Array(contents.length)
      .fill(null)
      .map((_, i) => elRefs.current[i] || createRef());
    // console.log("useEffect []", elRefs);
  }, []);

  useEffect(() => {
    if (elRefs.current[0].current !== null) {
      elWidth = elRefs.current.map(
        innerElRef => innerElRef.current.offsetWidth,
      );
    }
    // console.log("useEffect [beforeClick]", elWidth);
  }, [beforeClick]);

  function handleTransform(current: number) {
    if (beforeClick < current) {
      elWidth.map((size, elInedx) => {
        if (current == 0) { 
          setX(0)
        } else if (current > elInedx) {
          setX(x - size - 30);
        }
      });
    } else if (beforeClick > current) {
      elWidth.map((size, elInedx) => {
        if (current == 0) { 
          setX(0)
        } else if (current == elInedx) {
          setX(x + size +30);
        }
      });
    }
    setBeforeClick(current);
  }

  return (
    <Container>
      <RowFrame animate={{ x: x }} transition={spring}>
        <Heading fontSize={["32px", "64px", "64px", "80px"]}>
          {contents.map((item, i) => {
            return (
              <List
                onClick={e => {
                  handleTransform(i);
                }}
                ref={elRefs.current[i]}
              >
                {item}
              </List>
            );
          })}
        </Heading>
      </RowFrame>
    </Container>
  );
};

export default GradientRowList;

const Container = styled(Flex)`
  position: relative;
  width: 100%;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  margin: auto;

  &:before {
    left: 0;
    background: linear-gradient(90deg,#fff,hsla(0,0%,100%,0));
    content: "";
    top: 0;
    width: 8%;
    height: 100%;
    position: absolute;
    z-index: 100;
    pointer-events: none;
  }

  &:after {
    right: 0;
    background: linear-gradient(90deg,hsla(0,0%,100%,0),#fff);
    content: "";
    top: 0;
    width: 8%;
    height: 100%;
    position: absolute;
    z-index: 100;
    pointer-events: none;
  }
`;

const RowFrame = styled(motion.div)`
  display: flex;
  width: 80%;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[2])} {
    width: 95%;
  }
  
  cursor: pointer;

  &[data-isOn="true"] {
    color: "red";
    background-color: "red";
    justify-content: flex-start;
  }
`;

const List = styled.span`
  padding-left: 10px;
  margin-left: 30px;
  background: linear-gradient(30deg, #0567fa, #c561ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  &:first-child {
    margin-left: 0;
    padding-left: 0;
  }
`;

import styled from "@emotion/styled";
import { motion, useTransform, useMotionValue } from "framer-motion";
import React, { useState, useEffect, createRef } from "react";
import { Flex, Heading } from "rebass";

const GradientRowList = () => {
  const [x, setX] = useState<number>(0);
  const [beforeClick, setBeforeClick] = useState<number>(0);
  const elRefs = React.useRef([]);
  let elWidth = [];
  const contents = ["code", "server", "translations", "insight"];
  const spring = {
    type: "spring",
    stiffness: 700,
    damping: 30,
  };

  useEffect(() => {
    elRefs.current = Array(contents.length)
      .fill(null)
      .map((_, i) => elRefs.current[i] || createRef());
    console.log(elRefs);
  }, []);

  useEffect(() => {
    if (elRefs.current[0].current !== null) {
      elWidth = elRefs.current.map(
        innerElRef => innerElRef.current.offsetWidth,
      );
    }
    console.log(elWidth);
  }, [beforeClick]);

  function handleTransform(current: number) {
    if (beforeClick < current) {
      elWidth.map((size, elInedx) => {
        if (current > elInedx) {
          setX(x - size);
        }
      });
    } else if (beforeClick > current) {
      elWidth.map((size, elInedx) => {
        if (current < elInedx) {
          setX(x + size);
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
`;

const RowFrame = styled(motion.div)`
  display: flex;
  cursor: pointer;

  &[data-isOn="true"] {
    color: "red";
    background-color: "red";
    justify-content: flex-start;
  }
`;

const List = styled.span`
  padding-left: 10px;
  background: linear-gradient(30deg, #0567fa, #c561ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;

  &:first-child {
    padding-left: 0;
  }
`;

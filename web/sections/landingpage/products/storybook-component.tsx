import styled from "@emotion/styled";
import { motion } from "framer-motion";
import SectionLayout from "layouts/section";
import React, { useState } from "react";

import LandingpageText from "components/landingpage/text";
import { PRODUCT_LIST } from "utils/landingpage/constants";

import { List, RowFrame } from ".";

export const ProductMotion = () => {
  const [x, setX] = useState<number>(0);
  const [beforeClick, setBeforeClick] = useState<number>(0);
  const [counter, setCounter] = useState(1);
  const [isVideoPlayerReady, setIsVideoPlayerReady] = useState(false);
  const [elWidth, setElWidth] = useState([]);

  const elRefs = React.useRef([]);
  const spring = {
    type: "spring",
    stiffness: 200,
    damping: 25,
  };

  function handleTabSelectionChange(current: number) {
    let targetSize = 0;
    if (beforeClick < current) {
      elWidth.map((size, elIndex) => {
        if (current == 0) {
          setX(0);
        } else if (current > elIndex) {
          targetSize += size;
        }
      });
      setX(-targetSize);
    } else if (beforeClick > current) {
      elWidth.map((size, elInedx) => {
        if (current == 0) {
          setX(0);
        } else if (current == elInedx) {
          setX(x + size);
        }
      });
    }
    setBeforeClick(current);
    setIsVideoPlayerReady(false);
  }
  return (
    <RowFrame animate={{ x: x }} transition={spring}>
      <LandingpageText variant="h2" className="no-drag">
        {PRODUCT_LIST.map((item, i) => {
          return (
            <List
              key={i}
              gradient={beforeClick === i ? item.gradient : "#F1F1F1"}
              onClick={e => {
                handleTabSelectionChange(i);
              }}
              ref={elRefs.current[i]}
            >
              {item.title}
            </List>
          );
        })}
      </LandingpageText>
    </RowFrame>
  );
};

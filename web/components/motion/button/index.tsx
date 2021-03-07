import React from "react";
import styled from "@emotion/styled";
import { motion } from "framer-motion";
import { MotionItemContainer, MotionItemProps } from "../base";
import { ThemeInterface } from "utils/styled/theme";
import { media } from "utils/styled/media";

function MotionButton(props: MotionItemProps) {
  return (
    <MotionItemContainer onTriggerNext={props.onTriggerNext} key="button-motion">
      <Button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.05 }}>
        button
      </Button>
    </MotionItemContainer>
  );
}

export default MotionButton;

const Button = styled(motion.div)`
  background-color: #2562ff;
  width: 200px;
  height: 70px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 50px;
  border-radius: 19px;
  border: none;
  font-weight: 500;
  

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    margin-top: 20px;
  }

  ${props => media((props.theme as ThemeInterface).breakpoints[0], "")}{
    margin-left: 20px;
  }  
`;

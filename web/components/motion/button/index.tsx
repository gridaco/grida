import React from "react";
import styled from "@emotion/styled";
import { motion } from "framer-motion";
import { MotionItemContainer, MotionItemProps } from "../base";

function MotionButton(props: MotionItemProps) {
  return (
    <MotionItemContainer onTriggerNext={props.onTriggerNext}>
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
  
  @media(min-width: 768px) {
    margin-left: 20px;
  }
  @media(max-width: 767px) {
    margin-top: 20px;
  }
`;

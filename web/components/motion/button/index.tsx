import React from 'react'
import styled from "@emotion/styled";
import { motion } from 'framer-motion';

const MotionButton = () => {
  return (
    <Button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.1 }}  className="cursor">
      button
    </Button>
  )
}

export default MotionButton

const Button = styled(motion.div)`
  background-color: #2562FF;
  width: 200px;
  height: 70px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 50px;
  border-radius: 19px;
  border: none;
`
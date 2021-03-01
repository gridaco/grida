import React from "react";
import { Flex } from "rebass";
import BridgedDetection from "sections/root/bridged-detection";
import BridgedOuttro from "sections/root/bridged-outtro";
import BridgedSolutions from "sections/root/bridged-solutions";
import BridgedVideo from "sections/root/bridged-video";


const MainPage = () => {
  return (
    <Flex flexDirection="column">
      <BridgedVideo />
      <BridgedDetection />
      <BridgedSolutions />
      <BridgedOuttro />
    </Flex>
  );
};

export default MainPage;

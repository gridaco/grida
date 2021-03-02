import React from "react";
import { Flex } from "rebass";
import BridgedCollaborate from "sections/root/bridged-collaborate";
import BridgedDetection from "sections/root/bridged-detection";
import BridgedOuttro from "sections/root/bridged-outtro";
import BridgedSolutions from "sections/root/bridged-solutions";
import BridgedVideoSection from "sections/root/bridged-video";

const MainPage = () => {
  return (
    <Flex flexDirection="column">
      <BridgedVideoSection />
      <BridgedDetection />
      <BridgedSolutions />
      <BridgedCollaborate />
      <BridgedOuttro />
    </Flex>
  );
};

export default MainPage;

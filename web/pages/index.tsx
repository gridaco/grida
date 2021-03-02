import React from "react";
import { Flex } from "rebass";
import BridgedCollaborate from "sections/bridged/bridged-collaborate";
import BridgedDetection from "sections/bridged/bridged-detection";
import BridgedIntroduce from "sections/bridged/bridged-introduce";
import BridgedOuttro from "sections/bridged/bridged-outtro";
import BridgedSolutions from "sections/bridged/bridged-solutions";
import BridgedVideoSection from "sections/bridged/bridged-video";

const MainPage = () => {
  return (
    <Flex flexDirection="column">
      <BridgedVideoSection />
      {/* <BridgedIntroduce /> */}
      <BridgedDetection />
      <BridgedSolutions />
      <BridgedCollaborate />
      <BridgedOuttro />
    </Flex>
  );
};

export default MainPage;

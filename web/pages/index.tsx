import React from "react";
import { Flex } from "rebass";
import BridgedOuttro from "sections/bridged-outtro";
import BridgedVideo from "sections/bridged-video";


const MainPage = () => {
  return (
    <Flex flexDirection="column">
      <BridgedVideo />
      <BridgedOuttro />
    </Flex>
  );
};

export default MainPage;

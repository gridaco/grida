import React from "react";
import { Flex } from "rebass";
import BridgedOuttro from "sections/root/bridged-outtro";
import BridgedVideo from "sections/root/bridged-video";


const MainPage = () => {
  return (
    <Flex flexDirection="column">
      <BridgedVideo />
      <BridgedOuttro />
    </Flex>
  );
};

export default MainPage;

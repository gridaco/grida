import React from "react";
import { Flex, Text } from "theme-ui";

import Icon from "components/icon";

export function WasThisPostHelpful() {
  return (
    <Flex
      style={{
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
      }}
      mt="60px"
    >
      <Text
        style={{
          fontSize: "18px",
          fontWeight: "500",
        }}
        color="#686868"
      >
        Was this page helpful?
      </Text>
      <Flex mt="16px">
        <Icon className="cursor-pointer" name="thumbsup" mx="16px" />
        <Icon className="cursor-pointer" name="thumbsdown" mx="16px" />
      </Flex>
    </Flex>
  );
}

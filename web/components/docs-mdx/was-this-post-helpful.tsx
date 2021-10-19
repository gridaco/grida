import React from "react";
import { Flex, Text } from "rebass";

import Icon from "components/icon";

export function WasThisPostHelpful() {
  return (
    <Flex
      alignItems="center"
      justifyContent="center"
      mt="60px"
      flexDirection="column"
    >
      <Text fontSize="18px" fontWeight="500" color="#686868">
        Was this page helpful?
      </Text>
      <Flex mt="16px">
        <Icon className="cursor" name="thumbsup" mx="16px" />
        <Icon className="cursor" name="thumbsdown" mx="16px" />
      </Flex>
    </Flex>
  );
}

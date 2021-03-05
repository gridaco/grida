import React from 'react'
import { Flex } from 'rebass';

function BasicTemplate(props) {
  const { children } = props;

  return (
    <Flex flexDirection="column" width={["320px", "730px", "985px", "1040px"]}>
      {children}
    </Flex>
  )
}

export default BasicTemplate


import React from 'react'
import { Flex } from 'rebass';

function BasicTemplate(props) {
  const { children } = props;

  return (
    <Flex alignItems="center" justifyContent="center" >
      <Flex flexDirection="column" width={["320px", "730px", "985px", "1040px"]}>
        {children}
      </Flex>
    </Flex>
  )
}

export default BasicTemplate


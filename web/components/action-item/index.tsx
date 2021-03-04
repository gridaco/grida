import React from 'react'
import Link from 'next/link';
import { Text } from 'rebass';
import Icon from 'components/icon';

const ActionItem = ({ label, href }) => {
  return (
    <Link href={href} >
      <Text className="cursor" mr="auto" color="#7D7D7D" fontSize="24px" mb="25px">
        {label}
        <Icon name="arrowDown" isVerticalMiddle style={{ transform: "rotate(270deg)" }} />
      </Text>
    </Link>
  )
}

export default ActionItem

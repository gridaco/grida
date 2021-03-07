import React from 'react'
import { BridgedSection } from 'common/toolkit';

const MainPage = () => {
  return (
    BridgedSection.map((item) => item.content)
  )
}

export default MainPage

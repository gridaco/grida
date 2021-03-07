import React from 'react'
import { BridgedSection } from 'common/toolkit';
import { NextPage, NextPageContext } from 'next';
interface MainPageAppProps {
  isMobileView: boolean
}

const MainPage : NextPage<MainPageAppProps> = ({ isMobileView }) => {

  return (
    <React.Fragment>
      {BridgedSection.map((item) => item.content(isMobileView) )}
    </React.Fragment>
  )
}

MainPage.getInitialProps = async ({ req } : NextPageContext) => {
  let isMobileView = (req
    ? req.headers['user-agent']
    : navigator.userAgent).match(
      /Android|BlackBerry|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i
    )
    
    //Returning the isMobileView as a prop to the component for further use.
    return {
      isMobileView: Boolean(isMobileView)
    }
}

export default MainPage

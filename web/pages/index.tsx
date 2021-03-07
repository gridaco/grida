import React, { useCallback, useState, useEffect } from 'react'
import { BridgedSection } from 'common/toolkit';
import { NextPage, NextPageContext } from 'next';
import CookieAccept from 'components/cookie-accept';
import { useCookies } from "react-cookie"
interface MainPageAppProps {
  isMobileView: boolean
}

const MainPage: NextPage<MainPageAppProps> = ({ isMobileView }) => {
  const [cookie, setCookie] = useCookies(["cookieconsent_status"])
  const [openCookieAlert, setOpenCookieAlert] = useState(true);

  useEffect(() => {
    console.log(!Boolean(cookie["cookieconsent_status"]))
    if (!Boolean(cookie["cookieconsent_status"])) {
      setOpenCookieAlert(false)
    }
  }, [cookie])

  const onAcceptCookie = useCallback((isAccept: boolean) => {
    if (isAccept) {
      setCookie("cookieconsent_status", true, {
        path: "/",
        maxAge: 3600 * 24 * 365, // Expires after 1hr
        sameSite: true,
      })
    }
    setOpenCookieAlert(true)
  }, [cookie])

  return (
    <React.Fragment>
      {BridgedSection.map((item) => item.content(isMobileView))}
      {!openCookieAlert && <CookieAccept accpetCookie={onAcceptCookie} />}
    </React.Fragment>
  )
}

MainPage.getInitialProps = async ({ req }: NextPageContext) => {
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

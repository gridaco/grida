import React, { useCallback, useState, useEffect } from "react";
import { BridgedSection } from "common/toolkit";
import { NextPage, NextPageContext } from "next";
import CookieAccept from "components/cookie-accept";
import { useCookies } from "react-cookie";
import { motion } from "framer-motion";
interface MainPageAppProps {
  isMobileView: boolean;
}

const motionVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { delay: 3, duration: 0.1 } },
};

const COOKIE_CONSENT_ACCEPTENCE_STATUS_KEY = "cookieconsent_status";

const MainPage: NextPage<MainPageAppProps> = ({ isMobileView }) => {
  const [cookie, setCookie] = useCookies([
    COOKIE_CONSENT_ACCEPTENCE_STATUS_KEY,
  ]);
  const [openCookieAlert, setOpenCookieAlert] = useState(true);

  useEffect(() => {
    if (!Boolean(cookie[COOKIE_CONSENT_ACCEPTENCE_STATUS_KEY])) {
      setOpenCookieAlert(false);
    }
  }, [cookie]);

  const onAcceptCookie = useCallback(() => {
    setCookie(COOKIE_CONSENT_ACCEPTENCE_STATUS_KEY, true, {
      path: "/",
      maxAge: 3600 * 24 * 365, // Expires after 1year
      sameSite: true,
    });
    setOpenCookieAlert(true);
  }, [cookie]);

  return (
    <React.Fragment>
      {BridgedSection.map(item => item.content(isMobileView))}
      {!openCookieAlert && (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={motionVariants}
        >
          <CookieAccept accpetCookie={onAcceptCookie} />
        </motion.div>
      )}
    </React.Fragment>
  );
};

MainPage.getInitialProps = async ({ req }: NextPageContext) => {
  let isMobileView = (req
    ? req.headers["user-agent"]
    : navigator.userAgent
  ).match(/Android|BlackBerry|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i);

  //Returning the isMobileView as a prop to the component for further use.
  return {
    isMobileView: Boolean(isMobileView),
  };
};

export default MainPage;

import React from "react";
import { useMediaQuery } from "react-responsive";

const _xl = ({ children }) => {
  const isDesktop = useMediaQuery({ minWidth: 1440 });
  return isDesktop ? children : null;
};
const _lg = ({ children }) => {
  const isTablet = useMediaQuery({ minWidth: 1280, maxWidth: 1439 });
  return isTablet ? children : null;
};
const _md = ({ children }) => {
  const isMobile = useMediaQuery({ minWidth: 1024, maxWidth: 1279 });
  return isMobile ? children : null;
};
const _sm = ({ children }) => {
  const isNotMobile = useMediaQuery({ minWidth: 768, maxWidth: 1023 });
  return isNotMobile ? children : null;
};
const _xs = ({ children }) => {
  const isNotMobile = useMediaQuery({ maxWidth: 767 });
  return isNotMobile ? children : null;
};

export const BreakPoints = {
  xl: _xl,
  lg: _lg,
  md: _md,
  sm: _sm,
  xs: _xs,
};

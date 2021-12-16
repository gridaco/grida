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

const size = {
  xs: "320px",
  sm: "768px",
  md: "1024px",
  lg: "1280px",
  xl: "1440px",
};

export const breakpoints = {
  xs: `(max-width: 767px)`,
  sm: `(min-width: ${size.sm}) and (max-width: 1023px)`,
  md: `(min-width: ${size.md}) and (max-width: 1279px)`,
  lg: `(min-width: ${size.lg}) and (max-width: 1439px)`,
  xl: `(min-width: ${size.xl})`,
};

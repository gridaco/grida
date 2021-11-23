import React from "react";
import { useMediaQuery } from "react-responsive";

import LG from "./lg";
import MD from "./md";
import SM from "./sm";
import XL from "./xl";
import XS from "./xs";

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

const Section__BornToBeHeadLess = () => (
  <div>
    <_xl>
      <XL />
    </_xl>
    <_lg>
      <LG />
    </_lg>
    <_md>
      <MD />
    </_md>
    <_sm>
      <SM />
    </_sm>
    <_xs>
      <XS />
    </_xs>
  </div>
);

export default Section__BornToBeHeadLess;

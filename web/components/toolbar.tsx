import React, { useMemo } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import styled from "@emotion/styled";

// import CodeRoundSVG from "../assets/icons/mdi_code_round.svg";
// import LanguageRoundSVG from "../assets/icons/mdi_language_round.svg";

interface IToolbar {
  toQuicklook?: string;
  toGlobalization?: string;
}

const Toolbar: React.FC<IToolbar> = ({
  toQuicklook = "#",
  toGlobalization = "#",
  children,
}) => {
  const { pathname } = useRouter();
  const isCodeSelected = useMemo(() => pathname === "/quicklook", [pathname]);

  return (
    <Wrapper>
      <TabList>
        <Link href={toQuicklook}>
          <TabButton
            style={{ marginRight: 8 }}
            data-selected={isCodeSelected && "true"}
          >
            {/* <CodeRoundSVG /> */}
            Code Editor
          </TabButton>
        </Link>
        <Link href={toGlobalization}>
          <TabButton data-selected={!isCodeSelected && "true"}>
            {/* <LanguageRoundSVG /> */}
            Language translation
          </TabButton>
        </Link>
      </TabList>
      {children}
    </Wrapper>
  );
};

export default Toolbar;

const Wrapper = styled.div`
  padding: 10px 12px;
  background: #ffffff;
  box-shadow: inset 0px -1px 0px #e3e3e3;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const TabList = styled.div`
  display: flex;
  align-items: center;
`;

const TabButton = styled.button`
  border: 0;
  background-color: transparent;
  font-weight: 500;
  font-size: 14px;
  line-height: 1.2;
  color: #dadadc;
  border-radius: 4px;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:active,
  &:focus {
    outline: 0;
  }

  & > svg {
    height: 24px;
    width: 24px;
    margin-right: 8px;

    & > path {
      fill: #dadadc;
    }
  }

  &[data-selected="true"] {
    color: #151617;

    & > svg > path {
      fill: #151617;
    }
  }
`;

const TabIconImage = styled.img`
  margin-right: 8px;
  width: 24px;
  height: 24px;
`;

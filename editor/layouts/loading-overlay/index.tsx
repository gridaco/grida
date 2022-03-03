import React from "react";
import styled from "@emotion/styled";

/**
 * [design](https://www.figma.com/file/HSozKEVWhh8saZa2vr1Nxd/design-to-code?node-id=554%3A6162)
 * @returns
 */
function LoadingLayout({
  title = "Loading",
  content = "We are now loading design remotely..",
}: {
  title?: string;
  content?: string;
}) {
  return (
    <RootWrapperLoadingLayout>
      <Frame61>
        <Frame5>
          <Loading>{title}</Loading>
          <WeAreNowLoadingDesignRemotely>
            {content}
          </WeAreNowLoadingDesignRemotely>
        </Frame5>
      </Frame61>
    </RootWrapperLoadingLayout>
  );
}

const RootWrapperLoadingLayout = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  gap: 10px;
  min-height: 100vh;
  background-color: rgba(255, 255, 255, 1);
`;

const Frame61 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 10px;
  align-self: stretch;
  padding-bottom: 100px;
  padding-top: 100px;
  padding-left: 40px;
  padding-right: 10px;
`;

const Frame5 = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  gap: 9px;
`;

const Loading = styled.span`
  color: rgba(82, 82, 82, 1);
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: Helvetica Neue;
  font-weight: 500;
  text-align: left;
`;

const WeAreNowLoadingDesignRemotely = styled.span`
  color: rgba(190, 190, 190, 1);
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: Helvetica Neue;
  font-weight: 400;
  text-align: left;
`;

export default LoadingLayout;

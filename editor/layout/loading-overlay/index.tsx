import React from "react";
import styled from "@emotion/styled";

function LoadingLayout() {
  return (
    <RootWrapperLoadingLayout>
      <Container>
        <Loading>Loading</Loading>
        <WeAreNowLoadingDesignRemotely>
          We are now loading design remotely..
        </WeAreNowLoadingDesignRemotely>
      </Container>
    </RootWrapperLoadingLayout>
  );
}

const RootWrapperLoadingLayout = styled.div`
  min-height: 900px;
  background-color: rgba(255, 255, 255, 1);
  position: relative;
`;

const Container = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  gap: 24px;
  padding-bottom: 200px;
  padding-top: 200px;
  padding-left: 48px;
`;

const Loading = styled.span`
  color: rgba(82, 82, 82, 1);
  text-overflow: ellipsis;
  font-size: 36px;
  font-family: Helvetica Neue;
  font-weight: 500;
  text-align: left;
`;

const WeAreNowLoadingDesignRemotely = styled.span`
  color: rgba(154, 154, 154, 1);
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: Helvetica Neue;
  font-weight: 500;
  text-align: left;
`;

export default LoadingLayout;

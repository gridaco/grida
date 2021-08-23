import React from "react";
import styled from "@emotion/styled";

const DashboardSideFooter: React.FC = () => {
  return (
    <ButtonWrapper>
      <Button>
        <IconImage src="/assets/icons/mdi_settings.svg" />
        <span>Project Settings</span>
      </Button>
    </ButtonWrapper>
  );
};

export default DashboardSideFooter;

const ButtonWrapper = styled.div`
  padding: 24px;
  padding-top: 50px;
  width: 100%;
  display: flex;
  margin-top: auto;
`;

const Button = styled.button`
  width: 100%;
  background-color: #eaeaea;
  border: 0;
  border-radius: 8px;
  padding: 11px 0;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;

  span {
    font-weight: bold;
    font-size: 14px;
    line-height: 1.2;
    color: #222222;
  }
`;

const IconImage = styled.img`
  width: 16px;
  height: 16px;
  margin-right: 8px;
`;

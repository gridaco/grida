import React from "react";
import { NextRouter } from "next/router";
import styled from "@emotion/styled";

export interface INavigation {
  name: string;
  path?: string;
  icon?: string;
}

export interface IDashboardSideItem extends INavigation {
  isSelected?: boolean;
  router: NextRouter;
}

const DashboardSideItem: React.FC<IDashboardSideItem> = ({
  name,
  path,
  icon,
  isSelected,
  router,
}) => {
  const onClick = () => path && router.push(path);

  return (
    <Container data-selected={isSelected} onClick={onClick}>
      {icon && isSelected && <IconImage src={icon} />}
      <Name>{name}</Name>
    </Container>
  );
};

export default DashboardSideItem;

const Container = styled.div`
  padding: 14px 23px;
  display: flex;
  align-items: center;
  cursor: pointer;

  &[data-selected="true"] {
    background-color: rgba(196, 196, 196, 0.12);

    span {
      color: #3b3b3b;
    }
  }
`;

const IconImage = styled.img`
  width: 16px;
  height: 16px;
  margin-right: 8px;
`;

const Name = styled.span`
  font-weight: bold;
  font-size: 14px;
  line-height: 1.2;
  color: rgba(60, 60, 60, 0.3);
`;
